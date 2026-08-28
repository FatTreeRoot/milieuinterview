import { describe, expect, it } from "vitest";
import { DEFAULT_MIN_NOTES, NO_MIN_NOTES, meetsNoteMinimum } from "../index.js";

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
