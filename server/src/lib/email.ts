import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";
import { HttpError } from "./http.js";
import type { ExportedDocument } from "./exporter.js";

let transporter: Transporter | null = null;

function transport(): Transporter {
  if (!config.smtp) {
    throw new HttpError(
      503,
      "Email is not configured. Ask an administrator to set the SMTP details.",
    );
  }
  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined,
  });
  return transporter;
}

export async function sendDocuments(input: {
  to: string;
  candidateName: string;
  interviewType: string;
  message: string | null;
  attachments: ExportedDocument[];
}): Promise<void> {
  if (input.attachments.length === 0) {
    throw new HttpError(400, "Choose at least one document to send");
  }

  const intro = `Interview documents for ${input.candidateName} (${input.interviewType}).`;
  const body = input.message ? `${input.message}\n\n${intro}` : intro;

  await transport().sendMail({
    from: config.smtp?.from,
    to: input.to,
    subject: `Interview documents: ${input.candidateName}`,
    text: `${body}\n\nSent from the Milieu HR Interview Assistant.`,
    attachments: input.attachments.map((document) => ({
      filename: document.filename,
      content: document.body,
      contentType: document.contentType,
    })),
  });
}
