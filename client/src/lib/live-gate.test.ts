import { describe, expect, it } from "vitest";
import { claimLiveCall, freshGate, type LiveGate } from "./live-gate";

const CHARS = 40;
const COOLDOWN = 10000;

function gate(initial: LiveGate = freshGate()) {
  return { current: initial };
}

const text = (n: number) => "x".repeat(n);

describe("claimLiveCall", () => {
  it("holds off until enough has been written", () => {
    const g = gate();
    expect(claimLiveCall(g, text(39), CHARS, COOLDOWN, 1000)).toBe(false);
    expect(claimLiveCall(g, text(40), CHARS, COOLDOWN, 1000)).toBe(true);
  });

  it("records the call it allowed", () => {
    const g = gate();
    claimLiveCall(g, text(50), CHARS, COOLDOWN, 1000);
    expect(g.current).toEqual({ at: 1000, chars: 50 });
  });

  it("leaves the gate untouched when it refuses", () => {
    const g = gate();
    claimLiveCall(g, text(10), CHARS, COOLDOWN, 1000);
    expect(g.current).toEqual(freshGate());
  });

  it("holds off during the cooldown even when plenty is written", () => {
    const g = gate();
    claimLiveCall(g, text(50), CHARS, COOLDOWN, 1000);
    expect(claimLiveCall(g, text(200), CHARS, COOLDOWN, 5000)).toBe(false);
    expect(claimLiveCall(g, text(200), CHARS, COOLDOWN, 11000)).toBe(true);
  });

  it("measures new characters from the last call, not from the start", () => {
    const g = gate();
    claimLiveCall(g, text(50), CHARS, COOLDOWN, 1000);
    // 89 is only 39 past the last call, so it is still short.
    expect(claimLiveCall(g, text(89), CHARS, COOLDOWN, 20000)).toBe(false);
    expect(claimLiveCall(g, text(90), CHARS, COOLDOWN, 20000)).toBe(true);
  });

  /**
   * The bug this guards: the count used to be a high-water mark, so deleting
   * a sentence meant the interviewer had to out-type what they removed before
   * the AI would look again. In practice it went quiet for the question.
   */
  it("re-baselines when the interviewer deletes text", () => {
    const g = gate();
    claimLiveCall(g, text(200), CHARS, COOLDOWN, 1000);

    // Cut it back to 60 characters, then write 40 more.
    expect(claimLiveCall(g, text(60), CHARS, COOLDOWN, 20000)).toBe(false);
    expect(g.current.chars).toBe(60);
    expect(claimLiveCall(g, text(100), CHARS, COOLDOWN, 20000)).toBe(true);
  });

  it("does not let a deletion bypass the cooldown", () => {
    const g = gate();
    claimLiveCall(g, text(200), CHARS, COOLDOWN, 1000);
    expect(claimLiveCall(g, text(20), CHARS, COOLDOWN, 2000)).toBe(false);
    expect(claimLiveCall(g, text(80), CHARS, COOLDOWN, 2000)).toBe(false);
  });

  it("keeps the two watches independent", () => {
    const suggest = gate();
    const concern = gate();
    const notes = text(50);
    // 50 characters trips the looser concern gate but not the follow-up.
    expect(claimLiveCall(concern, notes, 40, 10000, 1000)).toBe(true);
    expect(claimLiveCall(suggest, notes, 80, 20000, 1000)).toBe(false);
  });
});
