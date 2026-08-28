import type {
  EvaluationReport,
  InterviewStatus,
  Response,
  TypeSnapshot,
} from "@milieu/shared";
import { effectiveScore, outcomeFor } from "@milieu/shared";
import { all, fromBool, get, parseJson, run, toBool, transaction } from "../db/index.js";
import { getType } from "./library.js";
import { id, now } from "./ids.js";
import { notFound } from "./http.js";

export type InterviewSummary = {
  id: string;
  typeId: string | null;
  typeName: string;
  candidateName: string;
  position: string | null;
  interviewerNames: string | null;
  status: InterviewStatus;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number;
  score: number | null;
  aiScore: number | null;
  finalScore: number | null;
  threshold: number | null;
  passed: boolean | null;
  borderline: boolean | null;
  redFlagCount: number;
};

export type InterviewDetail = InterviewSummary & {
  snapshot: TypeSnapshot;
  responses: Response[];
  report: EvaluationReport | null;
  documents: { kind: string; content: string; updatedAt: string }[];
};

const EMPTY_SNAPSHOT: TypeSnapshot = {
  name: "Unknown",
  passThreshold: 7.5,
  questions: [],
};

function summarize(row: Record<string, unknown>): InterviewSummary {
  const snapshot = parseJson<TypeSnapshot>(row["type_snapshot"], EMPTY_SNAPSHOT);
  const aiScore = (row["ai_score"] as number | null) ?? null;
  const finalScore = (row["final_score"] as number | null) ?? null;
  const threshold = (row["threshold"] as number | null) ?? snapshot.passThreshold;

  // Everything user-facing reads the interviewer's score when they gave one.
  const score = aiScore === null ? null : effectiveScore({ aiScore, finalScore });
  const outcome = score === null ? null : outcomeFor(score, threshold);

  return {
    id: row["id"] as string,
    typeId: (row["type_id"] as string | null) ?? null,
    typeName: snapshot.name,
    candidateName: row["candidate_name"] as string,
    position: (row["position"] as string | null) ?? null,
    interviewerNames: (row["interviewer_names"] as string | null) ?? null,
    status: row["status"] as InterviewStatus,
    startedAt: row["started_at"] as string,
    completedAt: (row["completed_at"] as string | null) ?? null,
    durationSeconds: (row["duration_seconds"] as number) ?? 0,
    score,
    aiScore,
    finalScore,
    threshold,
    passed: outcome?.passed ?? null,
    borderline: outcome?.borderline ?? null,
    redFlagCount: (row["red_flag_count"] as number) ?? 0,
  };
}

const BASE_SELECT = `
  SELECT i.*, e.ai_score, e.final_score, e.threshold, e.report,
         (SELECT COUNT(*) FROM responses r
           WHERE r.interview_id = i.id AND r.red_flag = 1) AS red_flag_count
    FROM interviews i
    LEFT JOIN evaluations e ON e.interview_id = i.id`;

export function listInterviews(filter: {
  status?: InterviewStatus | undefined;
  search?: string | undefined;
}): InterviewSummary[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    clauses.push("i.status = ?");
    params.push(filter.status);
  }
  if (filter.search) {
    clauses.push("(i.candidate_name LIKE ? OR i.position LIKE ?)");
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all(`${BASE_SELECT} ${where} ORDER BY i.started_at DESC`, ...params).map(
    summarize,
  );
}

export function getInterview(interviewId: string): InterviewDetail {
  const row = get(`${BASE_SELECT} WHERE i.id = ?`, interviewId);
  if (!row) throw notFound("That interview no longer exists");

  const responses = all(
    "SELECT * FROM responses WHERE interview_id = ?",
    interviewId,
  ).map<Response>((r) => ({
    questionId: r["question_id"] as string,
    notes: (r["notes"] as string) ?? "",
    inputValue: parseJson<unknown>(r["input_value"], null),
    interviewerRating: (r["interviewer_rating"] as number | null) ?? null,
    redFlag: toBool(r["red_flag"]),
    redFlagNote: (r["red_flag_note"] as string | null) ?? null,
    secondsSpent: (r["seconds_spent"] as number) ?? 0,
  }));

  const documents = all(
    "SELECT kind, content, updated_at FROM documents WHERE interview_id = ?",
    interviewId,
  ).map((d) => ({
    kind: d["kind"] as string,
    content: d["content"] as string,
    updatedAt: d["updated_at"] as string,
  }));

  return {
    ...summarize(row),
    snapshot: parseJson<TypeSnapshot>(row["type_snapshot"], EMPTY_SNAPSHOT),
    responses,
    report: row["report"]
      ? parseJson<EvaluationReport | null>(row["report"], null)
      : null,
    documents,
  };
}

export function startInterview(input: {
  typeId: string;
  candidateName: string;
  position: string | null;
  interviewerNames: string | null;
  userId: string;
}): string {
  const type = getType(input.typeId);
  // Frozen now, so editing the library later never rewrites this interview.
  const snapshot: TypeSnapshot = {
    name: type.name,
    passThreshold: type.passThreshold,
    questions: type.questions,
  };
  const interviewId = id();
  run(
    `INSERT INTO interviews
       (id, type_id, type_snapshot, candidate_name, position, interviewer_names,
        created_by, status, started_at, duration_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, 0)`,
    interviewId,
    type.id,
    JSON.stringify(snapshot),
    input.candidateName,
    input.position,
    input.interviewerNames,
    input.userId,
    now(),
  );
  return interviewId;
}

/**
 * Replaces the whole response set. The client sends everything it has, so a
 * tab that reconnects after being offline converges on its own state rather
 * than half-merging with what the server already had.
 */
export function saveDraft(
  interviewId: string,
  responses: Response[],
  durationSeconds: number,
): void {
  transaction(() => {
    run("DELETE FROM responses WHERE interview_id = ?", interviewId);
    for (const response of responses) {
      run(
        `INSERT INTO responses
           (id, interview_id, question_id, notes, input_value,
            interviewer_rating, red_flag, red_flag_note, seconds_spent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id(),
        interviewId,
        response.questionId,
        response.notes ?? "",
        JSON.stringify(response.inputValue ?? null),
        response.interviewerRating,
        fromBool(response.redFlag),
        response.redFlagNote,
        response.secondsSpent ?? 0,
      );
    }
    run(
      "UPDATE interviews SET duration_seconds = ? WHERE id = ?",
      durationSeconds,
      interviewId,
    );
  });
}

export function markCompleted(interviewId: string): void {
  run(
    "UPDATE interviews SET status = 'completed', completed_at = ? WHERE id = ?",
    now(),
    interviewId,
  );
}

export function deleteInterview(interviewId: string): void {
  run("DELETE FROM interviews WHERE id = ?", interviewId);
}

export function saveDocument(
  interviewId: string,
  kind: "cleaned" | "report",
  content: string,
): void {
  run(
    `INSERT INTO documents (id, interview_id, kind, content, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (interview_id, kind)
     DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    id(),
    interviewId,
    kind,
    content,
    now(),
  );
}

export function saveEvaluation(
  interviewId: string,
  aiScore: number,
  threshold: number,
  report: EvaluationReport,
): void {
  run(
    `INSERT INTO evaluations
       (id, interview_id, ai_score, final_score, threshold, report, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT (interview_id) DO UPDATE SET
       ai_score = excluded.ai_score,
       threshold = excluded.threshold,
       report = excluded.report,
       updated_at = excluded.updated_at`,
    id(),
    interviewId,
    aiScore,
    threshold,
    JSON.stringify(report),
    now(),
    now(),
  );
}

/** The interviewer's own overall score. null clears it and restores the AI's. */
export function setFinalScore(interviewId: string, score: number | null): void {
  run(
    "UPDATE evaluations SET final_score = ?, updated_at = ? WHERE interview_id = ?",
    score,
    now(),
    interviewId,
  );
}
