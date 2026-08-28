/**
 * Scoring rules. Kept in `shared` so the server, the PDF renderer and the
 * client all reach the same verdict from the same numbers.
 */

export const DEFAULT_PASS_THRESHOLD = 7.5;

/** Scores this close to the threshold are worth a human second look. */
export const BORDERLINE_MARGIN = 0.5;

export const SCORE_MIN = 0;
export const SCORE_MAX = 10;

export type Outcome = {
  passed: boolean;
  /** Within BORDERLINE_MARGIN of the threshold, on either side. */
  borderline: boolean;
  label: "Above threshold" | "Below threshold";
};

/** Scores are always reported to one decimal place. */
export function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}

export function clampScore(score: number): number {
  if (Number.isNaN(score)) return SCORE_MIN;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));
}

export function normalizeScore(score: number): number {
  return roundScore(clampScore(score));
}

/**
 * The interviewer's own score always wins over the AI's when they entered one.
 * Everything user-facing (badges, history, stats) reads through this.
 */
export function effectiveScore(evaluation: {
  aiScore: number;
  finalScore: number | null;
}): number {
  return evaluation.finalScore ?? evaluation.aiScore;
}

export function outcomeFor(score: number, threshold: number): Outcome {
  const s = roundScore(score);
  const t = roundScore(threshold);
  return {
    passed: s >= t,
    borderline: Math.abs(s - t) <= BORDERLINE_MARGIN,
    label: s >= t ? "Above threshold" : "Below threshold",
  };
}

export function formatScore(score: number): string {
  return normalizeScore(score).toFixed(1);
}
