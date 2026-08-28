import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { emailDocumentsSchema } from "@milieu/shared";
import { badRequest, parseBody, requireUser } from "../lib/http.js";
import { audit } from "../lib/audit.js";
import { exportDocument } from "../lib/exporter.js";
import { sendDocuments } from "../lib/email.js";
import { getInterview } from "../lib/interviews.js";
import { computeStats, interviewsCsv } from "../lib/stats.js";
import { docxToText } from "../lib/docx.js";
import { importTypeFromText } from "../ai/operations.js";

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/stats", async (request) => {
    requireUser(request);
    return { stats: computeStats() };
  });

  app.get("/api/interviews.csv", async (request, reply) => {
    const user = requireUser(request);
    audit(user.id, "export", "interviews", null, { format: "csv" });
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="milieu-interviews-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
      )
      .send(interviewsCsv());
  });

  app.get("/api/interviews/:id/documents/:kind.pdf", async (request, reply) => {
    const user = requireUser(request);
    const params = z
      .object({ id: z.string().min(1), kind: z.enum(["cleaned", "report"]) })
      .parse(request.params);

    const document = await exportDocument(params.id, params.kind);
    audit(user.id, "export", "interview", params.id, {
      kind: params.kind,
      format: "pdf",
    });
    return reply
      .header("Content-Type", document.contentType)
      .header(
        "Content-Disposition",
        `attachment; filename="${document.filename}"`,
      )
      .send(document.body);
  });

  app.post("/api/interviews/:id/email", async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = parseBody(emailDocumentsSchema, request.body);
    const interview = getInterview(id);

    const attachments = [];
    if (body.includeInterview) {
      attachments.push(await exportDocument(id, "cleaned"));
    }
    if (body.includeReport) {
      attachments.push(await exportDocument(id, "report"));
    }

    await sendDocuments({
      to: body.to,
      candidateName: interview.candidateName,
      interviewType: interview.snapshot.name,
      message: body.message,
      attachments,
    });

    // Recorded because this sends candidate information outside the app.
    audit(user.id, "email", "interview", id, {
      to: body.to,
      interview: body.includeInterview,
      report: body.includeReport,
    });
    return { ok: true };
  });

  /** Drafts a new interview type from an uploaded Word form, for review. */
  app.post("/api/types/import", async (request) => {
    requireUser(request);
    const file = await request.file();
    if (!file) throw badRequest("Choose a Word document to import");
    if (!file.filename.toLowerCase().endsWith(".docx")) {
      throw badRequest(
        "Only .docx files can be imported. Open a .doc in Word and save it as .docx first.",
      );
    }
    const buffer = await file.toBuffer();
    const text = docxToText(buffer);
    return { draft: await importTypeFromText(text) };
  });
}
