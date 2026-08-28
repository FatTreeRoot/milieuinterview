import { describe, expect, it } from "vitest";
import {
  applyHouseStyle,
  applyTranscriptStyle,
  preferPersonSupported,
  stripEmDashes,
} from "../text.js";

describe("stripEmDashes", () => {
  it("replaces a spaced em dash with a comma", () => {
    expect(stripEmDashes("The score — 8.5 — was strong")).toBe(
      "The score, 8.5, was strong",
    );
  });

  it("replaces an unspaced em dash with a comma", () => {
    expect(stripEmDashes("calm—then escalating")).toBe("calm, then escalating");
  });

  it("keeps numeric ranges readable as a hyphen", () => {
    expect(stripEmDashes("scores 7—9")).toBe("scores 7-9");
    expect(stripEmDashes("scores 7 — 9")).toBe("scores 7-9");
  });

  it("leaves hyphens and en dashes alone", () => {
    expect(stripEmDashes("trauma-informed")).toBe("trauma-informed");
    expect(stripEmDashes("pages 3–5")).toBe("pages 3–5");
  });

  it("is a no-op on text that never had one", () => {
    expect(stripEmDashes("A plain sentence.")).toBe("A plain sentence.");
  });
});

describe("preferPersonSupported", () => {
  it("replaces the word in both cases and numbers", () => {
    expect(preferPersonSupported("the client")).toBe("the person supported");
    expect(preferPersonSupported("Clients arrived")).toBe("People supported arrived");
  });

  it("only touches whole words", () => {
    expect(preferPersonSupported("client-centred")).toBe("person supported-centred");
    expect(preferPersonSupported("clientele")).toBe("clientele");
  });
});

describe("applyTranscriptStyle", () => {
  it("fixes punctuation but never rewords the interviewer", () => {
    expect(applyTranscriptStyle("She said — the client was calm")).toBe(
      "She said, the client was calm",
    );
  });
});

describe("applyHouseStyle", () => {
  it("applies both rules to prose the AI wrote", () => {
    expect(applyHouseStyle("The client — a strong candidate — answered well")).toBe(
      "The person supported, a strong candidate, answered well",
    );
  });
});
