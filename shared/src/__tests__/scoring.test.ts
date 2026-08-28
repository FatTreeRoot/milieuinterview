import { describe, expect, it } from "vitest";
import {
  BORDERLINE_MARGIN,
  DEFAULT_PASS_THRESHOLD,
  effectiveScore,
  formatScore,
  normalizeScore,
  outcomeFor,
} from "../scoring.js";

describe("normalizeScore", () => {
  it("rounds to one decimal place", () => {
    expect(normalizeScore(7.44)).toBe(7.4);
    expect(normalizeScore(7.45)).toBe(7.5);
    expect(normalizeScore(8)).toBe(8);
  });

  it("clamps to the 0-10 range", () => {
    expect(normalizeScore(-3)).toBe(0);
    expect(normalizeScore(11.2)).toBe(10);
  });

  it("treats NaN as the floor rather than propagating it", () => {
    expect(normalizeScore(Number.NaN)).toBe(0);
  });
});

describe("formatScore", () => {
  it("always shows one decimal", () => {
    expect(formatScore(8)).toBe("8.0");
    expect(formatScore(7.25)).toBe("7.3");
  });
});

describe("outcomeFor", () => {
  it("passes exactly at the threshold", () => {
    const o = outcomeFor(7.5, DEFAULT_PASS_THRESHOLD);
    expect(o.passed).toBe(true);
    expect(o.label).toBe("Above threshold");
  });

  it("fails just below the threshold", () => {
    const o = outcomeFor(7.4, DEFAULT_PASS_THRESHOLD);
    expect(o.passed).toBe(false);
    expect(o.label).toBe("Below threshold");
  });

  it("flags borderline on both sides of the threshold", () => {
    expect(outcomeFor(7.0, 7.5).borderline).toBe(true);
    expect(outcomeFor(8.0, 7.5).borderline).toBe(true);
    expect(outcomeFor(6.9, 7.5).borderline).toBe(false);
    expect(outcomeFor(8.1, 7.5).borderline).toBe(false);
  });

  it("borderline is independent of pass or fail", () => {
    expect(outcomeFor(7.5, 7.5)).toMatchObject({ passed: true, borderline: true });
    expect(outcomeFor(7.2, 7.5)).toMatchObject({ passed: false, borderline: true });
  });

  it("respects a per-type threshold, not just the default", () => {
    expect(outcomeFor(7.2, 7.0).passed).toBe(true);
    expect(outcomeFor(7.2, 9.0).passed).toBe(false);
  });

  it("uses the documented borderline margin", () => {
    expect(outcomeFor(7.5 - BORDERLINE_MARGIN, 7.5).borderline).toBe(true);
  });
});

describe("effectiveScore", () => {
  it("prefers the interviewer's score over the AI's", () => {
    expect(effectiveScore({ aiScore: 6.2, finalScore: 8.4 })).toBe(8.4);
  });

  it("falls back to the AI score when the interviewer did not enter one", () => {
    expect(effectiveScore({ aiScore: 6.2, finalScore: null })).toBe(6.2);
  });

  it("honours an explicit zero from the interviewer", () => {
    expect(effectiveScore({ aiScore: 6.2, finalScore: 0 })).toBe(0);
  });
});
