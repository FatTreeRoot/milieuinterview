import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { InterviewStatus, Response } from "@milieu/shared";
import {
  documentUpdateSchema,
  finalScoreSchema,
  saveDraftSchema,
  startInterviewSchema,
  liveNoteRequestSchema,
} from "@milieu/shared";
import {
  badRequest,
  forbidden,
  parseBody,
  requireAdmin,
  requireUser,
} from "../lib/http.js";
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
import {
  cleanUpNotes,
  detectConcern,
  evaluateInterview,
  suggestFollowUp,
} from "../ai/operations.js";
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

  /** Resolves the question a live call is about, or rejects the call. */
  function liveQuestion(body: { interviewId: string; questionId: string }) {
    const interview = getInterview(body.interviewId);
    const question = interview.snapshot.questions.find(
      (q) => q.id === body.questionId,
    );
    if (!question) throw badRequest("That question is not part of this interview");
    return { interview, question };
  }

  app.post("/api/interviews/:id/suggest", async (request) => {
    requireUser(request);
    const body = parseBody(liveNoteRequestSchema, request.body);
    const { interview, question } = liveQuestion(body);

    const suggestion = await suggestFollowUp(question, body.notes, interview.id);
    return { suggestion };
  });

  /**
   * The concern watch. Runs alongside the follow-up suggestion on every live
   * call, because the two look for opposite things and a troubling answer
   * usually trips only this one.
   */
  app.post("/api/interviews/:id/concern", async (request) => {
    requireUser(request);
    const body = parseBody(liveNoteRequestSchema, request.body);
    const { interview, question } = liveQuestion(body);

    const concern = await detectConcern(question, body.notes, interview.id);
    return { concern };
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

  /** The documents are the record of what was said, so staff cannot rewrite them. */
  app.put("/api/interviews/:id/documents/:kind", async (request) => {
    const user = requireAdmin(request);
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

  /**
   * A draft is work in progress, so anyone can cancel one and nothing is kept.
   * A completed interview is the record, and only an admin removes records.
   */
  app.delete("/api/interviews/:id", async (request) => {
    const user = requireUser(request);
    const { id } = idParams.parse(request.params);
    const interview = getInterview(id);
    if (interview.status === "completed" && user.role !== "admin") {
      throw forbidden("Only an administrator can delete a completed interview");
    }
    deleteInterview(id);
    audit(
      user.id,
      interview.status === "draft" ? "cancel" : "delete",
      "interview",
      id,
      { candidate: interview.candidateName },
    );
    return { ok: true };
  });
}
