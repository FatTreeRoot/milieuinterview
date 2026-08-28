import Anthropic from "@anthropic-ai/sdk";
import type { AiFeature } from "@milieu/shared";
import { config } from "../config.js";
import { run } from "../db/index.js";
import { id, now } from "../lib/ids.js";
import { HttpError } from "../lib/http.js";

/**
 * Model choice per feature, picked for cost.
 *
 * The two live calls fire repeatedly during an interview and each only has to
 * spot one obvious thing, a gap or a risk, so they run on the cheapest model.
 * The cleanup pass and the evaluation run once each and carry the judgement
 * that matters, so they get a stronger one.
 *
 * Haiku stays the right choice for the live calls even though its prompt
 * cannot be cached. Sonnet 5 would cache, but it also reads the same text as
 * ~37% more tokens (stablePrefix: 1359 against Haiku's 964), and the uncached
 * remainder at twice the input price more than eats the saving. Measured, a
 * live call is $0.0015 on Haiku against $0.0017 on Sonnet 5 with the cache
 * working.
 */
export const MODELS = {
  followup_suggestion: "claude-haiku-4-5",
  concern_detection: "claude-haiku-4-5",
  cleanup: "claude-sonnet-5",
  evaluation: "claude-sonnet-5",
  type_import: "claude-sonnet-5",
} as const satisfies Record<AiFeature, string>;

/**
 * USD per million tokens, for the spend estimate shown in Settings.
 *
 * A cache read costs a tenth of the input price; a cache write costs 1.25x it,
 * which is why writing a cache nothing ever reads is worse than not caching.
 */
const CACHE_WRITE_MULTIPLIER = 1.25;

const PRICING: Record<string, { input: number; output: number; cached: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5, cached: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cached: 0.2 },
};

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!config.anthropicApiKey) {
    throw new HttpError(
      503,
      "The AI features need an ANTHROPIC_API_KEY. Ask an administrator to set one.",
    );
  }
  client ??= new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export function estimateCost(model: string, usage: Usage): number {
  const price = PRICING[model];
  if (!price) return 0;
  const cached = usage.cache_read_input_tokens ?? 0;
  const written = usage.cache_creation_input_tokens ?? 0;
  const fresh = usage.input_tokens ?? 0;
  return (
    (fresh * price.input +
      written * price.input * CACHE_WRITE_MULTIPLIER +
      cached * price.cached +
      (usage.output_tokens ?? 0) * price.output) /
    1_000_000
  );
}

/** Every call is logged, so Settings can show what the AI features cost. */
export function recordUsage(
  feature: AiFeature,
  model: string,
  usage: Usage,
  interviewId: string | null,
): void {
  run(
    `INSERT INTO ai_usage
       (id, interview_id, feature, model, input_tokens, output_tokens,
        cache_read_tokens, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id(),
    interviewId,
    feature,
    model,
    usage.input_tokens ?? 0,
    usage.output_tokens ?? 0,
    usage.cache_read_input_tokens ?? 0,
    estimateCost(model, usage),
    now(),
  );
}

/** Pulls the plain text out of a response, ignoring thinking blocks. */
export function textOf(message: { content: unknown[] }): string {
  return message.content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: string }).type === "text",
    )
    .map((block) => block.text)
    .join("")
    .trim();
}

/**
 * Models sometimes wrap JSON in prose or a code fence even when told not to.
 * Falling back to the outermost braces is cheaper than a retry.
 */
export function parseJsonResponse<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    throw new HttpError(502, "The AI response could not be read. Please try again.");
  }
}
