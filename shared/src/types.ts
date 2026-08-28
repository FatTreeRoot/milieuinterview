/** Domain vocabulary shared by the server and the client. */

export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Every question always gets a free-text notes box. `inputKind` describes the
 * *extra* control shown above it, chosen per question so the interviewer can
 * capture the answer with one tap during a live conversation.
 */
export const INPUT_KINDS = [
  "text",
  "yes_no",
  "scale",
  "checkbox_list",
  "number",
] as const;
export type InputKind = (typeof INPUT_KINDS)[number];

export type InputConfig = {
  /** scale: inclusive bounds and end labels. */
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  /** checkbox_list: the options to tick. */
  options?: string[];
  /** number: unit shown beside the field. */
  unit?: string;
};

export const INTERVIEW_STATUSES = ["draft", "completed"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const DOCUMENT_KINDS = ["cleaned", "report"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Which AI feature spent the tokens, for the cost breakdown in Settings. */
export const AI_FEATURES = [
  "followup_suggestion",
  "cleanup",
  "evaluation",
  "type_import",
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

/**
 * How much the interviewer has to write before moving on.
 *
 * The point is to stop a substantive answer being recorded as "good" or
 * "yes", which leaves the evaluation with nothing to work from and the
 * document with no record of what was actually said.
 */
export const DEFAULT_MIN_NOTES = 120;

/** Simple intake questions are exempt: there is nothing more to write. */
export const NO_MIN_NOTES = 0;

export type Question = {
  id: string;
  sort: number;
  text: string;
  answerKey: string | null;
  inputKind: InputKind;
  inputConfig: InputConfig;
  /** Characters required in the notes. 0 means no minimum. */
  minNotes: number;
};

export type InterviewType = {
  id: string;
  name: string;
  description: string | null;
  passThreshold: number;
  archived: boolean;
  sort: number;
  questions: Question[];
};

/** Frozen copy of the type taken when an interview starts. */
export type TypeSnapshot = {
  name: string;
  passThreshold: number;
  questions: Question[];
};

export type Response = {
  questionId: string;
  notes: string;
  inputValue: unknown;
  interviewerRating: number | null;
  redFlag: boolean;
  redFlagNote: string | null;
  secondsSpent: number;
};

export type ReportFlag = {
  kind: "concern" | "note" | "follow_up";
  text: string;
  questionId: string | null;
};

export type ReportJustification = {
  text: string;
  /** The question this conclusion draws from, so every claim is traceable. */
  questionId: string;
};

export type EvaluationReport = {
  summary: string;
  justifications: ReportJustification[];
  flags: ReportFlag[];
};
