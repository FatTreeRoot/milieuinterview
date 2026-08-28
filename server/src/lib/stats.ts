import { outcomeFor } from "@milieu/shared";
import { all, run } from "../db/index.js";
import { listInterviews } from "./interviews.js";
import { retentionMonths } from "./settings.js";

export type Stats = {
  totals: {
    completed: number;
    drafts: number;
    passed: number;
    borderline: number;
    averageScore: number | null;
  };
  byMonth: { month: string; count: number; passed: number }[];
  byType: {
    typeName: string;
    count: number;
    passed: number;
    averageScore: number | null;
  }[];
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/**
 * Every figure here reads the interviewer's own score where they entered one,
 * because `listInterviews` resolves that before returning.
 */
export function computeStats(): Stats {
  const interviews = listInterviews({});
  const completed = interviews.filter(
    (i) => i.status === "completed" && i.score !== null,
  );

  const byMonth = new Map<string, { count: number; passed: number }>();
  const byType = new Map<
    string,
    { count: number; passed: number; scores: number[] }
  >();

  for (const interview of completed) {
    const month = interview.startedAt.slice(0, 7);
    const monthEntry = byMonth.get(month) ?? { count: 0, passed: 0 };
    monthEntry.count += 1;
    if (interview.passed) monthEntry.passed += 1;
    byMonth.set(month, monthEntry);

    const typeEntry = byType.get(interview.typeName) ?? {
      count: 0,
      passed: 0,
      scores: [],
    };
    typeEntry.count += 1;
    if (interview.passed) typeEntry.passed += 1;
    typeEntry.scores.push(interview.score as number);
    byType.set(interview.typeName, typeEntry);
  }

  return {
    totals: {
      completed: completed.length,
      drafts: interviews.filter((i) => i.status === "draft").length,
      passed: completed.filter((i) => i.passed).length,
      borderline: completed.filter((i) => i.borderline).length,
      averageScore: mean(completed.map((i) => i.score as number)),
    },
    byMonth: [...byMonth.entries()]
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12),
    byType: [...byType.entries()]
      .map(([typeName, v]) => ({
        typeName,
        count: v.count,
        passed: v.passed,
        averageScore: mean(v.scores),
      }))
      .sort((a, b) => b.count - a.count),
  };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function interviewsCsv(): string {
  const rows = listInterviews({});
  const header = [
    "Candidate",
    "Position",
    "Interview type",
    "Interviewers",
    "Status",
    "Started",
    "Completed",
    "Minutes",
    "AI score",
    "Interviewer score",
    "Score used",
    "Threshold",
    "Outcome",
    "Borderline",
    "Flags",
  ];
  const lines = [header.join(",")];

  for (const row of rows) {
    const outcome =
      row.score === null || row.threshold === null
        ? null
        : outcomeFor(row.score, row.threshold);
    lines.push(
      [
        row.candidateName,
        row.position,
        row.typeName,
        row.interviewerNames,
        row.status,
        row.startedAt,
        row.completedAt,
        row.durationSeconds ? Math.round(row.durationSeconds / 60) : "",
        row.aiScore ?? "",
        row.finalScore ?? "",
        row.score ?? "",
        row.threshold ?? "",
        outcome ? (outcome.passed ? "Pass" : "Below threshold") : "",
        outcome?.borderline ? "Yes" : "",
        row.redFlagCount || "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

/**
 * Deletes completed interviews past the retention window. Off unless an admin
 * has set a policy. Drafts are left alone: an unfinished interview has no
 * completion date to measure from.
 */
export function purgeOldInterviews(log: { info: (msg: string) => void }): void {
  const months = retentionMonths();
  if (months === null) return;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const stale = all(
    "SELECT id FROM interviews WHERE status = 'completed' AND completed_at < ?",
    cutoff.toISOString(),
  );
  if (stale.length === 0) return;

  for (const row of stale) {
    run("DELETE FROM interviews WHERE id = ?", row["id"]);
  }
  log.info(
    `Retention policy removed ${stale.length} interview(s) completed before ${cutoff.toISOString().slice(0, 10)}.`,
  );
}
