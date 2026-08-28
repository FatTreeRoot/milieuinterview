import type { EvaluationReport, Question, Response, TypeSnapshot } from "@milieu/shared";
import { applyHouseStyle, applyTranscriptStyle, normalizeScore } from "@milieu/shared";
import {
  MODELS,
  anthropic,
  parseJsonResponse,
  recordUsage,
  textOf,
  type Usage,
} from "./client.js";
import {
  CLEANUP_SYSTEM,
  CONCERN_SYSTEM,
  EVALUATION_SYSTEM,
  FOLLOWUP_SYSTEM,
  TYPE_IMPORT_SYSTEM,
  cleanupUserMessage,
  concernUserMessage,
  evaluationUserMessage,
  followupUserMessage,
  interviewPrefix,
  stablePrefix,
} from "./prompts.js";

/**
 * System blocks, ordered stable-first so the shared prefix can be one cache
 * entry across the features that run close enough together to reuse it.
 *
 * Measured token counts, which decide whether the marker does anything at all:
 * the minimum cacheable prefix is 4096 tokens on Haiku 4.5 and 1024 on Sonnet
 * 5, and stablePrefix is 964 tokens on Haiku, 1359 on Sonnet.
 *
 * So the marker is inert for the two live calls, which run on Haiku, and no
 * rearranging fixes that; their whole prompt is under 1600 tokens. It is left
 * in place because it costs nothing and becomes live if they ever move to a
 * model with a lower minimum. On Sonnet it does work, and cleanup and the
 * evaluation run seconds apart, so the second of them can read what the first
 * wrote.
 *
 * The per-interview block is deliberately NOT marked. Only the evaluation
 * sends one and it runs once, so a cache written there could never be read,
 * and an unread write costs 1.25x what not caching costs.
 */
function systemBlocks(instructions: string, perInterview?: string) {
  const blocks: {
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }[] = [
    { type: "text", text: stablePrefix(), cache_control: { type: "ephemeral" } },
    { type: "text", text: instructions },
  ];
  if (perInterview) {
    blocks.push({ type: "text", text: perInterview });
  }
  return blocks;
}

/**
 * A single follow-up suggestion, or null for silence.
 *
 * The client already gates how often this can fire. This is the cheap model
 * with a small output cap, so an interview's worth of suggestions costs cents.
 */
export async function suggestFollowUp(
  question: Question,
  notes: string,
  interviewId: string,
): Promise<string | null> {
  const model = MODELS.followup_suggestion;
  const message = await anthropic().messages.create({
    model,
    max_tokens: 100,
    system: systemBlocks(FOLLOWUP_SYSTEM),
    messages: [{ role: "user", content: followupUserMessage(question, notes) }],
  });
  recordUsage("followup_suggestion", model, message.usage as Usage, interviewId);

  const text = textOf(message);
  if (!text || /^none\b/i.test(text)) return null;
  return applyHouseStyle(text);
}

/**
 * A single concern raised from the notes so far, or null for silence.
 *
 * Separate from the follow-up suggestion on purpose. That one hunts for a gap,
 * an absence a question would fill, so a troubling answer that is complete and
 * specific reads to it as nothing to ask about. This one is looking for the
 * opposite: content that is present and carries risk.
 *
 * Nothing here writes to the interview record. The interviewer decides whether
 * a concern becomes a flag, so a false positive costs a glance, not a mark
 * against a candidate.
 */
export async function detectConcern(
  question: Question,
  notes: string,
  interviewId: string,
): Promise<string | null> {
  const model = MODELS.concern_detection;
  const message = await anthropic().messages.create({
    model,
    max_tokens: 100,
    system: systemBlocks(CONCERN_SYSTEM),
    messages: [{ role: "user", content: concernUserMessage(question, notes) }],
  });
  recordUsage("concern_detection", model, message.usage as Usage, interviewId);

  const text = textOf(message);
  if (!text || /^none/i.test(text)) return null;
  return applyHouseStyle(text);
}

export type CleanedResponse = { questionId: string; cleaned: string };

/** Grammar, spelling and formatting only. The interviewer's words stay theirs. */
export async function cleanUpNotes(
  snapshot: TypeSnapshot,
  responses: Response[],
  interviewId: string,
): Promise<CleanedResponse[]> {
  const model = MODELS.cleanup;
  const message = await anthropic().messages.create({
    model,
    max_tokens: 16000,
    system: systemBlocks(CLEANUP_SYSTEM),
    messages: [
      { role: "user", content: cleanupUserMessage(snapshot, responses) },
    ],
  });
  recordUsage("cleanup", model, message.usage as Usage, interviewId);

  const parsed = parseJsonResponse<{ responses?: CleanedResponse[] }>(
    textOf(message),
  );
  return (parsed.responses ?? []).map((entry) => ({
    questionId: entry.questionId,
    // Punctuation only. Rewording the interviewer is not this pass's job.
    cleaned: applyTranscriptStyle(entry.cleaned ?? ""),
  }));
}

export type EvaluationResult = { score: number; report: EvaluationReport };

export async function evaluateInterview(
  snapshot: TypeSnapshot,
  responses: Response[],
  interviewId: string,
): Promise<EvaluationResult> {
  const model = MODELS.evaluation;
  const message = await anthropic().messages.create({
    model,
    max_tokens: 8000,
    system: systemBlocks(EVALUATION_SYSTEM, interviewPrefix(snapshot)),
    messages: [
      { role: "user", content: evaluationUserMessage(snapshot, responses) },
    ],
  });
  recordUsage("evaluation", model, message.usage as Usage, interviewId);

  const parsed = parseJsonResponse<{
    score?: number;
    summary?: string;
    justifications?: { questionId?: string; text?: string }[];
    flags?: { kind?: string; questionId?: string | null; text?: string }[];
  }>(textOf(message));

  const validIds = new Set(snapshot.questions.map((q) => q.id));
  const kinds = new Set(["concern", "note", "follow_up"]);

  return {
    score: normalizeScore(Number(parsed.score ?? 0)),
    report: {
      summary: applyHouseStyle(parsed.summary ?? ""),
      // Drop anything pointing at a question this interview does not have,
      // so a hallucinated id cannot break the report view.
      justifications: (parsed.justifications ?? [])
        .filter((j) => j.questionId && validIds.has(j.questionId) && j.text)
        .map((j) => ({
          questionId: j.questionId as string,
          text: applyHouseStyle(j.text as string),
        })),
      flags: (parsed.flags ?? [])
        .filter((f) => f.text)
        .map((f) => ({
          kind: (kinds.has(f.kind ?? "") ? f.kind : "note") as
            | "concern"
            | "note"
            | "follow_up",
          questionId:
            f.questionId && validIds.has(f.questionId) ? f.questionId : null,
          text: applyHouseStyle(f.text as string),
        })),
    },
  };
}

export type ImportedType = {
  name: string;
  description: string | null;
  passThreshold: number;
  questions: {
    text: string;
    answerKey: string | null;
    inputKind: "text" | "yes_no" | "scale" | "checkbox_list" | "number";
    inputConfig: Record<string, never>;
  }[];
};

/** Drafts a new interview type from a Word form, for review before saving. */
export async function importTypeFromText(
  documentText: string,
): Promise<ImportedType> {
  const model = MODELS.type_import;
  const message = await anthropic().messages.create({
    model,
    max_tokens: 16000,
    system: systemBlocks(TYPE_IMPORT_SYSTEM),
    messages: [
      { role: "user", content: `Interview form:\n\n${documentText}` },
    ],
  });
  recordUsage("type_import", model, message.usage as Usage, null);

  const parsed = parseJsonResponse<{
    name?: string;
    description?: string;
    passThreshold?: number;
    questions?: { text?: string; answerKey?: string | null; inputKind?: string }[];
  }>(textOf(message));

  const kinds = new Set(["text", "yes_no", "scale", "checkbox_list", "number"]);
  const threshold = Number(parsed.passThreshold);

  return {
    name: parsed.name?.trim() || "Imported interview",
    description: parsed.description?.trim() || null,
    passThreshold:
      Number.isFinite(threshold) && threshold > 0 && threshold <= 10
        ? threshold
        : 7.5,
    questions: (parsed.questions ?? [])
      .filter((q) => q.text?.trim())
      .map((q) => ({
        text: (q.text as string).trim(),
        answerKey: q.answerKey?.trim() || null,
        inputKind: (kinds.has(q.inputKind ?? "")
          ? q.inputKind
          : "text") as ImportedType["questions"][number]["inputKind"],
        inputConfig: {} as Record<string, never>,
      })),
  };
}
