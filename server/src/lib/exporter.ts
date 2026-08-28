import type { DocumentKind } from "@milieu/shared";
import { renderPdf } from "../pdf/render.js";
import { getInterview } from "./interviews.js";
import { notFound } from "./http.js";

/**
 * The single way a document leaves the app.
 *
 * Today the only destination is a download. Keeping the render and the
 * destination separate means adding another one later (posting the PDF
 * somewhere, say) is a new destination rather than a rewrite.
 */

export type ExportedDocument = {
  filename: string;
  contentType: "application/pdf";
  body: Buffer;
};

function safeFilename(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document"
  );
}

export async function exportDocument(
  interviewId: string,
  kind: DocumentKind,
): Promise<ExportedDocument> {
  const interview = getInterview(interviewId);
  const document = interview.documents.find((d) => d.kind === kind);
  if (!document) {
    throw notFound(
      kind === "cleaned"
        ? "This interview has no document yet"
        : "This interview has no evaluation report yet",
    );
  }

  const date = interview.startedAt.slice(0, 10);
  const label = kind === "cleaned" ? "interview" : "evaluation";
  const filename = `${safeFilename(interview.candidateName)}-${label}-${date}.pdf`;

  const footer = `${interview.candidateName} · ${interview.snapshot.name} · Milieu Family Services`;
  return {
    filename,
    contentType: "application/pdf",
    body: await renderPdf(document.content, footer),
  };
}
