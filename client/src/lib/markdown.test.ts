/**
 * @vitest-environment jsdom
 *
 * The round trip is the part that matters. Editing a document sends it through
 * markdown to HTML and back, so a gap here silently rewrites HR's records on
 * save rather than failing loudly.
 */
import { describe, expect, it } from "vitest";
import { htmlToMarkdown, markdownToHtml } from "./markdown";

/** Mirrors what the editor does: render, then read back. */
function roundTrip(markdown: string): string {
  const host = document.createElement("div");
  host.innerHTML = markdownToHtml(markdown);
  return htmlToMarkdown(host).trim();
}

/**
 * What the editor actually promises: a document that renders identically, not
 * one that is byte for byte the same. Blank lines only separate blocks here,
 * so normalising them changes the text without changing the document.
 */
function blocks(markdown: string): string {
  const host = document.createElement("div");
  host.innerHTML = markdownToHtml(markdown);
  return host.innerHTML;
}

describe("markdownToHtml", () => {
  it("renders the block types the documents use", () => {
    const html = markdownToHtml(
      "# Title\n\n## Section\n\n---\n\nA paragraph.\n\n- one\n- two\n\n> A callout",
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Section</h2>");
    expect(html).toContain("<hr>");
    expect(html).toContain("<p>A paragraph.</p>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<blockquote>A callout</blockquote>");
  });

  it("renders bold and italic", () => {
    expect(markdownToHtml("**Candidate:** Jordan")).toContain(
      "<strong>Candidate:</strong>",
    );
    expect(markdownToHtml("*(question 4)*")).toContain("<em>(question 4)</em>");
  });

  it("escapes HTML rather than passing it through", () => {
    const html = markdownToHtml("She said <script>alert(1)</script> loudly");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("gives an empty document somewhere to put the caret", () => {
    expect(markdownToHtml("")).toBe("<p><br></p>");
  });
});

describe("round trip", () => {
  it("keeps a heading", () => {
    expect(roundTrip("# Evaluation report")).toBe("# Evaluation report");
  });

  it("keeps a section heading", () => {
    expect(roundTrip("## Summary")).toBe("## Summary");
  });

  it("keeps a bulleted list intact", () => {
    expect(roundTrip("- first\n- second\n- third")).toBe(
      "- first\n- second\n- third",
    );
  });

  it("keeps a callout", () => {
    expect(roundTrip("> **Borderline.** Worth a second look.")).toBe(
      "> **Borderline.** Worth a second look.",
    );
  });

  it("keeps bold and italic runs", () => {
    expect(roundTrip("- Gave an example *(question 3)*")).toBe(
      "- Gave an example *(question 3)*",
    );
    expect(roundTrip("**Candidate:** Jordan Rivera")).toBe(
      "**Candidate:** Jordan Rivera",
    );
  });

  it("keeps a horizontal rule", () => {
    expect(roundTrip("# Title\n\n---\n\nBody")).toBe("# Title\n\n---\n\nBody");
  });

  it("keeps a whole evaluation report rendering identically", () => {
    const report = [
      "# Evaluation report",
      "",
      "**Candidate:** Jordan Rivera",
      "**Interview:** Youth Internal",
      "",
      "---",
      "",
      "## Score: 6.9 out of 10",
      "",
      "Below threshold. The pass threshold for this interview is 7.0.",
      "",
      "> **Borderline.** This score sits within 0.5 of the threshold.",
      "",
      "## Reasoning",
      "",
      "- Gave a concrete example of de-escalation *(question 5)*",
      "- Could not describe when a protocol applies *(question 12)*",
      "",
      "## Concerns",
      "",
      "- Unclear on external reporting duties *(question 12)*",
    ].join("\n");
    expect(blocks(roundTrip(report))).toBe(blocks(report));
  });

  it("keeps consecutive header lines as separate lines", () => {
    // Ordinary markdown joins these into one paragraph, which would run the
    // candidate's name straight into the interview type.
    const header = "**Candidate:** Jordan Rivera\n**Interview:** Youth Internal";
    expect(blocks(header)).toBe(
      "<p><strong>Candidate:</strong> Jordan Rivera</p>" +
        "<p><strong>Interview:</strong> Youth Internal</p>",
    );
    expect(blocks(roundTrip(header))).toBe(blocks(header));
  });

  it("is stable: a second edit changes nothing further", () => {
    const report =
      "# Report\n\n**Candidate:** Jordan\n**Date:** 2026-08-27\n\n## Summary\n\nStrong answers.\n\n- One point\n- Another";
    const once = roundTrip(report);
    expect(roundTrip(once)).toBe(once);
  });

  it("keeps an interview document with ratings and a flag rendering identically", () => {
    const document_ = [
      "# Adult Internal",
      "",
      "**Candidate:** Jordan Rivera",
      "",
      "---",
      "",
      "## 1. What does a person centred approach mean to you?",
      "",
      "The person leads. Gave an example about woodworking.",
      "",
      "*Interviewer rating: 4 of 5*",
      "",
      "## 2. Describe a safety plan.",
      "",
      "*No notes recorded.*",
      "",
      "> **Flagged by the interviewer.** Unclear on the basics.",
    ].join("\n");
    expect(blocks(roundTrip(document_))).toBe(blocks(document_));
  });
});

describe("htmlToMarkdown", () => {
  function fromHtml(html: string): string {
    const host = document.createElement("div");
    host.innerHTML = html;
    return htmlToMarkdown(host).trim();
  }

  it("reads the divs a browser produces while editing", () => {
    // contentEditable wraps new lines in divs rather than paragraphs.
    expect(fromHtml("<div>First line</div><div>Second line</div>")).toBe(
      "First line\n\nSecond line",
    );
  });

  it("recurses into a wrapper rather than flattening it into one line", () => {
    expect(fromHtml("<div><h2>Heading</h2><p>Body</p></div>")).toBe(
      "## Heading\n\nBody",
    );
  });

  it("keeps the text of tags it does not model", () => {
    expect(fromHtml("<p>A <span style='color:red'>red</span> word</p>")).toBe(
      "A red word",
    );
  });

  it("drops empty blocks rather than emitting blank bullets", () => {
    expect(fromHtml("<ul><li>real</li><li></li></ul>")).toBe("- real");
  });

  it("treats a heading pasted as h3 as a section heading", () => {
    expect(fromHtml("<h3>Section</h3>")).toBe("## Section");
  });

  it("collapses a run of blank lines", () => {
    expect(fromHtml("<p>One</p><p></p><p></p><p>Two</p>")).toBe("One\n\nTwo");
  });
});
