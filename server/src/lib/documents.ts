import { formatScore, outcomeFor } from "@milieu/shared";
import type { CleanedResponse, EvaluationResult } from "../ai/operations.js";
import type { InterviewDetail } from "./interviews.js";

/**
 * The two documents are stored as markdown. HR edits them in the app and the
 * PDF renderer reads the same text, so what they see is what they export.
 */

function header(interview: InterviewDetail): string {
  const lines = [
    `# ${interview.snapshot.name}`,
    "",
    `**Candidate:** ${interview.candidateName}`,
  ];
  if (interview.position) lines.push(`**Position:** ${interview.position}`);
  if (interview.interviewerNames) {
    lines.push(`**Interviewers:** ${interview.interviewerNames}`);
  }
  lines.push(
    `**Date:** ${new Date(interview.startedAt).toLocaleDateString("en-CA")}`,
  );
  if (interview.durationSeconds > 0) {
    const minutes = Math.round(interview.durationSeconds / 60);
    lines.push(`**Duration:** ${minutes} minute${minutes === 1 ? "" : "s"}`);
  }
  return lines.join("\n");
}

export function renderCleanedDocument(
  interview: InterviewDetail,
  cleaned: CleanedResponse[],
): string {
  const byQuestion = new Map(cleaned.map((c) => [c.questionId, c.cleaned]));
  const byResponse = new Map(interview.responses.map((r) => [r.questionId, r]));

  const sections = interview.snapshot.questions.map((question, index) => {
    const response = byResponse.get(question.id);
    // Fall back to the raw notes if the cleanup pass skipped this question,
    // so a partial AI result never silently drops what was written.
    const notes = byQuestion.get(question.id) ?? response?.notes ?? "";

    const parts = [`## ${index + 1}. ${question.text}`, ""];
    if (response?.inputValue !== null && response?.inputValue !== undefined) {
      parts.push(`*Answer: ${formatInputValue(response.inputValue)}*`, "");
    }
    parts.push(notes.trim() || "*No notes recorded.*");
    if (response?.interviewerRating) {
      parts.push("", `*Interviewer rating: ${response.interviewerRating} of 5*`);
    }
    if (response?.redFlag) {
      parts.push(
        "",
        `> **Flagged by the interviewer.**${
          response.redFlagNote ? ` ${response.redFlagNote}` : ""
        }`,
      );
    }
    return parts.join("\n");
  });

  return `${header(interview)}\n\n---\n\n${sections.join("\n\n")}\n`;
}

function formatInputValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function renderReportDocument(
  interview: InterviewDetail,
  evaluation: EvaluationResult,
): string {
  const threshold = interview.snapshot.passThreshold;
  const outcome = outcomeFor(evaluation.score, threshold);
  const questionNumber = new Map(
    interview.snapshot.questions.map((q, index) => [q.id, index + 1]),
  );

  const lines = [
    `# Evaluation report`,
    "",
    `**Candidate:** ${interview.candidateName}`,
    `**Interview:** ${interview.snapshot.name}`,
    `**Date:** ${new Date(interview.startedAt).toLocaleDateString("en-CA")}`,
    "",
    "---",
    "",
    `## Score: ${formatScore(evaluation.score)} out of 10`,
    "",
    `${outcome.label}. The pass threshold for this interview is ${formatScore(threshold)}.`,
  ];

  if (outcome.borderline) {
    lines.push(
      "",
      "> **Borderline.** This score sits within 0.5 of the threshold and is worth a second look.",
    );
  }

  if (evaluation.report.summary) {
    lines.push("", "## Summary", "", evaluation.report.summary);
  }

  if (evaluation.report.justifications.length > 0) {
    lines.push("", "## Reasoning", "");
    for (const justification of evaluation.report.justifications) {
      const number = questionNumber.get(justification.questionId);
      lines.push(
        `- ${justification.text}${number ? ` *(question ${number})*` : ""}`,
      );
    }
  }

  const groups = [
    { kind: "concern", title: "Concerns" },
    { kind: "follow_up", title: "To follow up" },
    { kind: "note", title: "Worth noting" },
  ] as const;

  for (const group of groups) {
    const flags = evaluation.report.flags.filter((f) => f.kind === group.kind);
    if (flags.length === 0) continue;
    lines.push("", `## ${group.title}`, "");
    for (const flag of flags) {
      const number = flag.questionId
        ? questionNumber.get(flag.questionId)
        : undefined;
      lines.push(`- ${flag.text}${number ? ` *(question ${number})*` : ""}`);
    }
  }

  const flagged = interview.responses.filter((r) => r.redFlag);
  if (flagged.length > 0) {
    lines.push("", "## Flagged during the interview", "");
    for (const response of flagged) {
      const number = questionNumber.get(response.questionId);
      lines.push(
        `- Question ${number ?? "?"}${
          response.redFlagNote ? `: ${response.redFlagNote}` : ""
        }`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
