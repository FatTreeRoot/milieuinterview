import { describe, expect, it } from "vitest";
import type { Question } from "@milieu/shared";
import { renderCleanedDocument, renderReportDocument } from "../lib/documents.js";
import type { InterviewDetail } from "../lib/interviews.js";

function question(id: string, text: string): Question {
  return { id, sort: 0, text, answerKey: null, inputKind: "text", inputConfig: {} };
}

function interview(overrides: Partial<InterviewDetail> = {}): InterviewDetail {
  return {
    id: "iv1",
    typeId: "t1",
    typeName: "Youth Internal",
    candidateName: "Jordan Rivera",
    position: "Youth Support Worker",
    interviewerNames: "A. Patel",
    status: "completed",
    startedAt: "2026-08-27T15:00:00.000Z",
    completedAt: "2026-08-27T16:00:00.000Z",
    durationSeconds: 3600,
    score: null,
    aiScore: null,
    finalScore: null,
    threshold: 7,
    passed: null,
    borderline: null,
    redFlagCount: 0,
    snapshot: {
      name: "Youth Internal",
      passThreshold: 7,
      questions: [question("q1", "First question?"), question("q2", "Second question?")],
    },
    responses: [
      {
        questionId: "q1",
        notes: "raw notes one",
        inputValue: null,
        interviewerRating: 4,
        redFlag: false,
        redFlagNote: null,
        secondsSpent: 60,
      },
    ],
    report: null,
    documents: [],
    ...overrides,
  };
}

describe("renderCleanedDocument", () => {
  it("uses the cleaned text when the AI returned it", () => {
    const output = renderCleanedDocument(interview(), [
      { questionId: "q1", cleaned: "Raw notes one." },
    ]);
    expect(output).toContain("Raw notes one.");
    expect(output).toContain("## 1. First question?");
  });

  it("falls back to the raw notes for a question the cleanup pass skipped", () => {
    // A partial AI result must never silently drop what the interviewer wrote.
    const output = renderCleanedDocument(interview(), []);
    expect(output).toContain("raw notes one");
  });

  it("marks questions that were never answered", () => {
    const output = renderCleanedDocument(interview(), []);
    expect(output).toContain("*No notes recorded.*");
  });

  it("records the interviewer's rating and flag", () => {
    const detail = interview({
      responses: [
        {
          questionId: "q1",
          notes: "concerning answer",
          inputValue: null,
          interviewerRating: 2,
          redFlag: true,
          redFlagNote: "Did not mention reporting",
          secondsSpent: 30,
        },
      ],
    });
    const output = renderCleanedDocument(detail, []);
    expect(output).toContain("Interviewer rating: 2 of 5");
    expect(output).toContain("Did not mention reporting");
  });

  it("writes a yes or no answer as a word, not a boolean", () => {
    const detail = interview({
      responses: [
        {
          questionId: "q1",
          notes: "",
          inputValue: false,
          interviewerRating: null,
          redFlag: false,
          redFlagNote: null,
          secondsSpent: 0,
        },
      ],
    });
    expect(renderCleanedDocument(detail, [])).toContain("*Answer: No*");
  });
});

describe("renderReportDocument", () => {
  const evaluation = {
    score: 7.4,
    report: {
      summary: "Strong on de-escalation.",
      justifications: [{ questionId: "q1", text: "Gave a concrete example" }],
      flags: [
        { kind: "concern" as const, questionId: "q2", text: "Unclear on reporting" },
        { kind: "follow_up" as const, questionId: null, text: "Check references" },
      ],
    },
  };

  it("states the outcome against the threshold", () => {
    const output = renderReportDocument(interview(), evaluation);
    expect(output).toContain("## Score: 7.4 out of 10");
    expect(output).toContain("Above threshold");
    expect(output).toContain("7.0");
  });

  it("calls out a borderline score", () => {
    const output = renderReportDocument(interview(), evaluation);
    expect(output).toContain("Borderline");
  });

  it("leaves out the borderline note when the score is clear of the threshold", () => {
    const output = renderReportDocument(interview(), { ...evaluation, score: 9.2 });
    expect(output).not.toContain("Borderline");
  });

  it("points each conclusion at the question it came from", () => {
    const output = renderReportDocument(interview(), evaluation);
    expect(output).toContain("Gave a concrete example *(question 1)*");
    expect(output).toContain("Unclear on reporting *(question 2)*");
  });

  it("groups flags under their own headings", () => {
    const output = renderReportDocument(interview(), evaluation);
    expect(output).toContain("## Concerns");
    expect(output).toContain("## To follow up");
    expect(output).not.toContain("## Worth noting");
  });

  it("lists what the interviewer flagged during the interview", () => {
    const detail = interview({
      responses: [
        {
          questionId: "q2",
          notes: "",
          inputValue: null,
          interviewerRating: null,
          redFlag: true,
          redFlagNote: "Contradicted an earlier answer",
          secondsSpent: 0,
        },
      ],
    });
    const output = renderReportDocument(detail, evaluation);
    expect(output).toContain("## Flagged during the interview");
    expect(output).toContain("Contradicted an earlier answer");
  });
});
