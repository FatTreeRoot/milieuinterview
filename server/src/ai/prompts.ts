import type { Question, Response, TypeSnapshot } from "@milieu/shared";
import { isStatement, questionNumbers } from "@milieu/shared";
import { orgContext } from "../lib/settings.js";

/**
 * The rules that apply to everything the AI writes. Kept short: the same text
 * is prepended to every call, and shared/text.ts enforces the language rules
 * again on the way out.
 */
export const HOUSE_RULES = `You are assisting HR staff at Milieu Family Services, a social services agency.

Rules for everything you write:
- Never use the word "client" for a person Milieu supports. Write "person supported" or "people supported".
- Never use em dashes. Use a comma, a full stop, or a rephrase.
- This work involves vulnerable children, youth and adults. Be precise and careful. Do not speculate beyond the notes, and do not use clinical labels the notes do not use.`;

/**
 * The cacheable prefix: house rules plus the agency context. Identical on
 * every call, so it should be one cached block. Anything that varies per
 * request has to come after it or the cache never hits.
 */
export function stablePrefix(): string {
  return `${HOUSE_RULES}\n\n${orgContext()}`;
}

/** Statements carry nothing to score, so they are left out entirely. */
function asked(questions: Question[]): Question[] {
  return questions.filter((q) => !isStatement(q));
}

function questionList(questions: Question[]): string {
  return asked(questions)
    .map((question, index) => {
      const key = question.answerKey
        ? `\n   Answer key:\n${question.answerKey
            .split("\n")
            .map((line) => `   ${line}`)
            .join("\n")}`
        : "";
      return `${index + 1}. [${question.id}] ${question.text}${key}`;
    })
    .join("\n");
}

/** The interview's own questions and keys. Stable for one interview. */
export function interviewPrefix(snapshot: TypeSnapshot): string {
  return `Interview type: ${snapshot.name}
Pass threshold: ${snapshot.passThreshold.toFixed(1)} out of 10

Questions and answer keys:
${questionList(snapshot.questions)}`;
}

export const FOLLOWUP_SYSTEM = `${HOUSE_RULES}

You watch an interviewer's notes as they type and occasionally suggest one follow-up question.

Silence is the default. Reply with exactly NONE unless the notes show a clear, specific gap that a follow-up would close, such as a claim with no example behind it, a safety or safeguarding point left unresolved, or an answer key point the candidate has clearly not touched.

Do not suggest a follow-up because an answer is merely short or still in progress. The interviewer is mid-conversation and an unnecessary interruption costs them more than a missed question.

When you do suggest one, reply with the question alone. One sentence, no preamble, no explanation, under 25 words.`;

export function followupUserMessage(question: Question, notes: string): string {
  const key = question.answerKey ? `\n\nAnswer key:\n${question.answerKey}` : "";
  return `Question being asked:\n${question.text}${key}\n\nNotes so far:\n${notes}`;
}

export const CONCERN_SYSTEM = `${HOUSE_RULES}

You watch an interviewer's notes as they type and raise a concern when the candidate has described something that would put a person supported at risk.

Raise one only for what the candidate says they themselves did, said, or would do. The kinds of thing that matter here: rough handling or physical force, a boundary crossed with a person supported or their family, a disclosure of abuse they did not pass on, a safeguarding or reporting duty ignored, a punitive or controlling response to behaviour, working around a care plan or their supervision, medication handled outside protocol, or an account of their own record that does not hold together.

Silence is the default. Reply with exactly NONE when the notes show none of that.

A weak, thin, vague or unimpressive answer is not a concern. Neither is inexperience, nerves, an unfinished sentence, or a candidate describing something troubling that someone else did. The evaluation at the end of the interview judges how well they answered. Your only job is the thing an HR reader would later wish had been asked about while the candidate was still in the room.

Never diagnose the candidate, never apply a label to them, and never say or imply whether they should be hired. Do not go past what the notes say. If it reads two ways, one of them fine, stay silent.

When you do raise one, reply with a single sentence: what they said, and what to ask to clarify it. No preamble, under 30 words.`;

export function concernUserMessage(question: Question, notes: string): string {
  return `Question being asked:
${question.text}

Notes so far:
${notes}`;
}

export const CLEANUP_SYSTEM = `${HOUSE_RULES}

You tidy an interviewer's live notes into a readable record.

Fix only spelling, grammar, capitalisation, punctuation and obvious shorthand. Keep their wording, their phrasing choices, their ordering and their meaning exactly as they are. Do not add, infer, summarise, soften or embellish anything. If a note is a fragment, keep it a fragment and just make it readable.

The one exception to preserving wording: never introduce the word "client" yourself. If the interviewer wrote it, leave it, because it is their record of what was said.

Return JSON only, no other text:
{"responses":[{"questionId":"<id>","cleaned":"<the tidied notes>"}]}

Include every question you are given, in the same order. If a question has no notes, return an empty string for it.`;

export function cleanupUserMessage(
  snapshot: TypeSnapshot,
  responses: Response[],
): string {
  const byQuestion = new Map(responses.map((r) => [r.questionId, r]));
  const numbers = questionNumbers(snapshot.questions);
  const blocks = asked(snapshot.questions).map((question) => {
    const response = byQuestion.get(question.id);
    return `[${question.id}] Q${numbers.get(question.id)}: ${question.text}\nNotes: ${
      response?.notes?.trim() || "(no notes)"
    }`;
  });
  return `Tidy the notes below.\n\n${blocks.join("\n\n")}`;
}

export const EVALUATION_SYSTEM = `${HOUSE_RULES}

You evaluate a completed interview and write a short report for HR.

Score the candidate from 0.0 to 10.0, one decimal place, judged against the answer keys where a question has one and against the demands of the role where it does not. A question the candidate was not asked, or that carries no notes, must not count against them.

Every conclusion you draw must point at the question it comes from. Do not make a claim the notes do not support.

Keep it short. No padding, no restating the question back, no filler encouragement.

Return JSON only, no other text:
{
  "score": 7.4,
  "summary": "<two or three sentences on the candidate overall>",
  "justifications": [{"questionId":"<id>","text":"<what this answer showed>"}],
  "flags": [{"kind":"concern|note|follow_up","questionId":"<id or null>","text":"<the point>"}]
}

Use "concern" for something that counts against hiring, "follow_up" for something to ask about at the next stage or check with references, and "note" for anything else worth knowing. Return an empty flags array if there is genuinely nothing to raise.`;

export function evaluationUserMessage(
  snapshot: TypeSnapshot,
  responses: Response[],
): string {
  const byQuestion = new Map(responses.map((r) => [r.questionId, r]));
  const numbers = questionNumbers(snapshot.questions);
  const blocks = asked(snapshot.questions).map((question) => {
    const response = byQuestion.get(question.id);
    const parts = [`[${question.id}] Q${numbers.get(question.id)}: ${question.text}`];
    if (question.answerKey) parts.push(`Answer key:\n${question.answerKey}`);
    parts.push(`Candidate's answer: ${response?.notes?.trim() || "(not answered)"}`);
    if (response?.interviewerRating) {
      parts.push(`Interviewer rated this ${response.interviewerRating} out of 5.`);
    }
    if (response?.redFlag) {
      parts.push(
        `The interviewer flagged this answer as a concern${
          response.redFlagNote ? `: ${response.redFlagNote}` : "."
        }`,
      );
    }
    return parts.join("\n");
  });

  return `Interview type: ${snapshot.name}
Pass threshold: ${snapshot.passThreshold.toFixed(1)} out of 10

${blocks.join("\n\n")}`;
}

export const TYPE_IMPORT_SYSTEM = `${HOUSE_RULES}

You turn a Word interview form into structured interview data.

The document is a paper form, so most of it is not a question: signature lines, date fields, scoring boxes, page numbers and instructions addressed to the interviewer. Keep only what an interviewer would actually ask a candidate.

Some forms include an answer key: points listed under a question that a strong answer would cover. Attach those to their question rather than treating them as questions themselves.

Return JSON only, no other text:
{
  "name":"<short name for this interview type>",
  "description":"<one sentence>",
  "passThreshold":7.5,
  "questions":[{"text":"<question>","answerKey":"<key points, or null>","inputKind":"text|yes_no|scale|checkbox_list|number"}]
}

Use "yes_no" only where the form itself gives the question Yes and No boxes. Use "text" for everything open-ended. If the form states a required percentage, convert it to a threshold out of 10, so 70% becomes 7.0.`;
