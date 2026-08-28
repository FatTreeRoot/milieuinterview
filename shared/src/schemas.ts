import { z } from "zod";
import { DEFAULT_MIN_NOTES, INPUT_KINDS, ROLES } from "./types.js";
import { SCORE_MAX, SCORE_MIN } from "./scoring.js";

const email = z.string().trim().toLowerCase().email("Enter a valid email address");
const password = z.string().min(10, "Use at least 10 characters");
const name = z.string().trim().min(1, "Required").max(120);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name,
  email,
  password,
  accessCode: z.string().trim().min(1, "An access code is required"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: password,
});

export const inputConfigSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
  options: z.array(z.string()).optional(),
  unit: z.string().optional(),
});

export const questionInputSchema = z.object({
  id: z.string().optional(),
  text: z.string().trim().min(1, "A question needs text"),
  answerKey: z.string().nullable().default(null),
  inputKind: z.enum(INPUT_KINDS).default("text"),
  inputConfig: inputConfigSchema.default({}),
  // 0 disables the minimum for that question.
  minNotes: z.number().int().min(0).max(2000).default(DEFAULT_MIN_NOTES),
});

export const interviewTypeInputSchema = z.object({
  name,
  description: z.string().nullable().default(null),
  passThreshold: z.number().min(SCORE_MIN).max(SCORE_MAX),
  questions: z.array(questionInputSchema).min(1, "Add at least one question"),
});
export type InterviewTypeInput = z.infer<typeof interviewTypeInputSchema>;

export const startInterviewSchema = z.object({
  typeId: z.string().min(1),
  candidateName: name,
  position: z.string().trim().max(200).nullable().default(null),
  interviewerNames: z.string().trim().max(400).nullable().default(null),
});

export const responseInputSchema = z.object({
  questionId: z.string().min(1),
  notes: z.string().default(""),
  inputValue: z.unknown().nullable().default(null),
  interviewerRating: z.number().int().min(1).max(5).nullable().default(null),
  redFlag: z.boolean().default(false),
  redFlagNote: z.string().nullable().default(null),
  secondsSpent: z.number().int().min(0).default(0),
});

/** Draft autosave. Sent whole so a reconnecting client always converges. */
export const saveDraftSchema = z.object({
  responses: z.array(responseInputSchema),
  durationSeconds: z.number().int().min(0).default(0),
});

export const suggestionRequestSchema = z.object({
  interviewId: z.string().min(1),
  questionId: z.string().min(1),
  notes: z.string().min(1),
});

export const finalScoreSchema = z.object({
  finalScore: z.number().min(SCORE_MIN).max(SCORE_MAX).nullable(),
});

export const documentUpdateSchema = z.object({
  content: z.string(),
});

export const accessCodeSchema = z.object({
  label: z.string().trim().min(1, "Give the code a label").max(120),
});

export const updateUserSchema = z.object({
  role: z.enum(ROLES),
});

export const settingsSchema = z.object({
  orgContext: z.string().optional(),
  /** Months to keep completed interviews. null disables auto-purge. */
  retentionMonths: z.number().int().min(1).max(120).nullable().optional(),
});

export const emailDocumentsSchema = z.object({
  to: email,
  includeInterview: z.boolean().default(true),
  includeReport: z.boolean().default(true),
  message: z.string().max(2000).nullable().default(null),
});
