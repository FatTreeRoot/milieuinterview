import { unzipSync, strFromU8 } from "fflate";
import { badRequest } from "./http.js";

/**
 * Plain text out of a .docx.
 *
 * A .docx is a ZIP whose word/document.xml holds the content. Paragraph and
 * tab elements become whitespace; everything else is markup we drop. This is
 * enough for reading an interview form, and it avoids pulling in a full Word
 * parser for a feature that hands its output to a model anyway.
 */
export function docxToText(buffer: Buffer): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch {
    throw badRequest(
      "That file could not be read. Word 97-2003 (.doc) files need to be saved as .docx first.",
    );
  }

  const document = files["word/document.xml"];
  if (!document) {
    throw badRequest("That does not look like a Word document.");
  }

  const xml = strFromU8(document);
  const text = xml
    .replace(/<w:p[ >]/g, "\n<w:p ")
    .replace(/<w:tab\b[^>]*\/?>/g, "\t")
    .replace(/<w:br\b[^>]*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw badRequest("That document appears to be empty.");
  }
  return lines.join("\n");
}
