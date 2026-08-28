import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { InterviewStatus, Response } from "@milieu/shared";
import {
  documentUpdateSchema,
  finalScoreSchema,
  saveDraftSchema,
  startInterviewSchema,
  suggestionRequestSchema,
} from "@milieu/shared";
import { badRequest, parseBody, requireUser } from "../lib/http.js";
import { audit } from "../lib/audit.js";
import {
  deleteInterview,
  getInterview,
  listInterviews,
  markCompleted,
  saveDocument,
  saveDraft,
  saveEvaluation,
  setFinalScore,
  startInterview,
} from "../lib/interviews.js";
import { cleanUpNotes, evaluateInterview, suggestFollowUp } from "../ai/operations.js";
import { renderCleanedDocument, renderReportDocument } from "../lib/documents.js";

const idParams = z.object({ id: z.string().min(1) });

export async function interviewRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/interviews", async (request) => {
    requireUser(request);
    const query = request.query as { status?: string; search?: string };
    const status =
      query.status === "draft" || query.status === "completed"
        ? (query.status as InterviewStatus)
        : undefined;
    return { interviews: listInterviews({ status, search: query.search }) };
  });

  app.get("/api/interviews/:id", async (request) => {
    requireUser(request);
    const { id } = idParams.parse(request.params);
    return { interview: getInterview(id) };
  });

  app.post("/api/interviews", async (request) => {
    const user = requireUser(request);
    const body = parseBody(startInterviewSchema, request.body);
    const interviewId = startInterview({ ...body, userId: user.id });
    audit(user.id, "start", "interview", interviewId, {
      candidate: body.candidateName,
    });
    return { interview: getInterview(interviewId) };
  });

  /** Autosave. Called repeatedly during an interview, so it stays cheap. */
  app.put("/api/interviews/:id/draft", async (request) => {
    requireUser(request);
    const { id } = idParams.parse(request.params);
    const body = parseBody(saveDraftSchema, request.body);
    getInterview(id);
    saveDraft(id, body.responses as Response[], body.durationSeconds);
    return { ok: true, savedAt: new Date().toISOString() };
  });

  app.post("/api/interviews/:id/suggest", async (request) => {
    requireUser(request);
    const body = parseBody(suggestionRequestSchema, request.body);
    const interview = getInterview(body.interviewId);
    const question = interview.snapshot.questions.find(
      (q) => q.id === body.questionId,
    );
    if (!question) throw badRequest("That question is not part of this interview");

    const suggestion = await suggestFollowUp(question, body.notes, interview.id);
    return { suggestion };
  });

  /**
   * Completing an interview runs both AI passes. They are independent, so a
   * failure in one should not lose the other; the client can retry whichever
   * did not land.
   */
  app.post("/api/interviews/:id/complete", async (request) => {
    const user = requireUser(request);
    const { id } = idParams.parse(request.params);
    const body = parseBody(saveDraftSchema, request.body);

    saveDraft(id, body.responses as Response[], body.durationSeconds);
    const interview = getInterview(id);

    const [cleanup, evaluation] = await Promise.allSettled([
      cleanUpNotes(interview.snapshot, interview.responses, id),
      evaluateInterview(interview.snapshot, interview.responses, id),
    ]);

    if (cleanup.status === "fulfilled") {
      saveDocument(
        id,
        "cleaned",
        renderCleanedDocument(interview, cleanup.value),
      );
    }
    if (evaluation.status === "fulfilled") {
      saveEvaluation(
        id,
        evaluation.value.score,
        interview.snapshot.passThreshold,
        evaluation.value.report,
      );
      saveDocument(
        id,
        "report",
        renderReportDocument(interview, evaluation.value),
      );
    }

    markCompleted(id);
    audit(user.id, "complete", "interview", id);

    const failures: string[] = [];
    if (cleanup.status === "rejected") {
      request.log.error({ err: cleanup.reason }, "cleanup pass failed");
      failures.push("cleanup");
    }
    if (evaluation.status === "rejected") {
      request.log.error({ err: evaluation.reason }, "evaluation pass failed");
      failures.push("evaluation");
    }

    return { interview: getInterview(id), failures };
  });

  /** The interviewer's own overall score, which outranks the AI's. */
  app.put("/api/interviews/:id/score", async (request) => {
    const user = requireUser(request);
    const { id } = idParams.parse(request.params);
    const body = parseBody(finalScoreSchema, request.body);
    const interview = getInterview(id);
    if (interview.aiScore === null) {
      throw badRequest("This interview has no evaluation to score against yet");
    }
    setFinalScore(id, body.finalScore);
    audit(user.id, "set_final_score", "interview", id, {
      score: body.finalScore,
    });
    return { interview: getInterview(id) };
  });

  app.put("/api/interviews/:id/documents/:kind", async (request) => {
    const user = requireUser(request);
    const params = z
      .object({ id: z.string().min(1), kind: z.enum(["cleaned", "report"]) })
      .parse(request.params);
    const body = parseBody(documentUpdateSchema, request.body);
    getInterview(params.id);
    saveDocument(params.id, params.kind, body.content);
    audit(user.id, "edit_document", "interview", params.id, {
      kind: params.kind,
    });
    return { ok: true };
  });

  app.delete("/api/interviews/:id", async (request) => {
    const user = requireUser(request);
    const { id } = idParams.parse(request.params);
    const interview = getInterview(id);
    deleteInterview(id);
    audit(user.id, "delete", "interview", id, {
      candidate: interview.candidateName,
    });
    return { ok: true };
  });
}
