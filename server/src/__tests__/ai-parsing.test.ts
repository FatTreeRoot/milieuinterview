import { describe, expect, it } from "vitest";
import { estimateCost, parseJsonResponse, textOf } from "../ai/client.js";

describe("parseJsonResponse", () => {
  it("reads plain JSON", () => {
    expect(parseJsonResponse<{ score: number }>('{"score":7.4}')).toEqual({
      score: 7.4,
    });
  });

  it("reads JSON out of a fenced block", () => {
    const text = 'Here you go:\n```json\n{"score":8.1}\n```';
    expect(parseJsonResponse<{ score: number }>(text)).toEqual({ score: 8.1 });
  });

  it("reads JSON out of an unlabelled fence", () => {
    expect(parseJsonResponse<{ ok: boolean }>('```\n{"ok":true}\n```')).toEqual({
      ok: true,
    });
  });

  it("falls back to the outermost braces when prose wraps the JSON", () => {
    const text = 'Sure. {"score":6.2} Let me know if you need more.';
    expect(parseJsonResponse<{ score: number }>(text)).toEqual({ score: 6.2 });
  });

  it("throws a readable error rather than crashing on unusable output", () => {
    expect(() => parseJsonResponse("no json at all here")).toThrow(
      /could not be read/i,
    );
  });
});

describe("textOf", () => {
  it("joins text blocks and ignores others", () => {
    const message = {
      content: [
        { type: "thinking", thinking: "hidden" },
        { type: "text", text: "Ask about " },
        { type: "text", text: "de-escalation." },
      ],
    };
    expect(textOf(message)).toBe("Ask about de-escalation.");
  });

  it("returns an empty string when there is no text", () => {
    expect(textOf({ content: [] })).toBe("");
  });
});

describe("estimateCost", () => {
  it("prices cached input far below fresh input", () => {
    const fresh = estimateCost("claude-sonnet-5", { input_tokens: 100_000 });
    const cached = estimateCost("claude-sonnet-5", {
      cache_read_input_tokens: 100_000,
    });
    expect(fresh).toBeCloseTo(0.2, 5);
    expect(cached).toBeCloseTo(0.02, 5);
  });

  it("counts cache writes at the full input rate", () => {
    expect(
      estimateCost("claude-haiku-4-5", { cache_creation_input_tokens: 1_000_000 }),
    ).toBeCloseTo(1, 5);
  });

  it("returns zero for a model it does not know rather than guessing", () => {
    expect(estimateCost("some-future-model", { input_tokens: 1000 })).toBe(0);
  });
});
