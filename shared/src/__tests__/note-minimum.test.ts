import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_NOTES,
  NO_MIN_NOTES,
  isStatement,
  meetsNoteMinimum,
  questionNumbers,
} from "../index.js";

describe("meetsNoteMinimum", () => {
  const long = "x".repeat(DEFAULT_MIN_NOTES);

  it("passes once the minimum is reached", () => {
    expect(meetsNoteMinimum(long, DEFAULT_MIN_NOTES)).toBe(true);
  });

  it("fails one character short", () => {
    expect(meetsNoteMinimum(long.slice(0, -1), DEFAULT_MIN_NOTES)).toBe(false);
  });

  it("exempts a question with no minimum", () => {
    // Simple intake questions carry 0, so a yes or no is enough.
    expect(meetsNoteMinimum("", NO_MIN_NOTES)).toBe(true);
    expect(meetsNoteMinimum("", 0)).toBe(true);
  });

  it("does not count padding whitespace towards the total", () => {
    expect(meetsNoteMinimum(" ".repeat(200), DEFAULT_MIN_NOTES)).toBe(false);
    expect(meetsNoteMinimum(`   ${long}   `, DEFAULT_MIN_NOTES)).toBe(true);
  });

  it("treats an empty answer as short whenever a minimum is set", () => {
    expect(meetsNoteMinimum("", DEFAULT_MIN_NOTES)).toBe(false);
  });

  it("honours a minimum an admin has raised or lowered", () => {
    expect(meetsNoteMinimum("short answer", 10)).toBe(true);
    expect(meetsNoteMinimum("short answer", 500)).toBe(false);
  });
});

describe("questionNumbers", () => {
  const items = [
    { id: "s1", inputKind: "statement" as const },
    { id: "q1", inputKind: "text" as const },
    { id: "q2", inputKind: "yes_no" as const },
    { id: "s2", inputKind: "statement" as const },
    { id: "q3", inputKind: "text" as const },
  ];

  it("numbers only the questions that are asked", () => {
    const numbers = questionNumbers(items);
    expect(numbers.get("q1")).toBe(1);
    expect(numbers.get("q2")).toBe(2);
    expect(numbers.get("q3")).toBe(3);
  });

  it("gives statements no number at all", () => {
    const numbers = questionNumbers(items);
    expect(numbers.has("s1")).toBe(false);
    expect(numbers.has("s2")).toBe(false);
  });

  it("does not let a leading statement push the first question to 2", () => {
    // The interviewer sees "Question 1" first, so the document and the
    // report's question references have to agree.
    expect(questionNumbers(items).get("q1")).toBe(1);
  });
});

describe("isStatement", () => {
  it("is true only for statements", () => {
    expect(isStatement({ inputKind: "statement" })).toBe(true);
    expect(isStatement({ inputKind: "text" })).toBe(false);
    expect(isStatement({ inputKind: "yes_no" })).toBe(false);
  });
});
