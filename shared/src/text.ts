/**
 * House language rules, enforced in code rather than trusted to the prompt.
 * The prompts state these rules too; this is the safety net on the way out.
 *
 * Which rule applies depends on who is speaking. The cleaned interview document
 * is the interviewer's own words and must not be reworded, so it only gets
 * punctuation fixes. Prose the AI wrote itself gets the full rule set.
 */

const EM_DASH = /[—―]/g;

/**
 * Milieu style forbids em dashes as punctuation. Between digits an em dash is
 * standing in for a range, so it becomes a hyphen; everywhere else it is doing
 * the job of a comma.
 */
export function stripEmDashes(input: string): string {
  return input
    .replace(/(\d)\s*[—―]\s*(\d)/g, "$1-$2")
    .replace(/\s*[—―]\s*/g, ", ")
    .replace(EM_DASH, ", ");
}

/**
 * "Client" is not how Milieu refers to the people it supports. Only whole words
 * are touched, and capitalisation is carried across.
 *
 * Never run this over the cleaned interview document: if a candidate said
 * "client", rewriting it would change the interviewer's record of their words.
 */
export function preferPersonSupported(input: string): string {
  return input
    .replace(/\bclients\b/g, "people supported")
    .replace(/\bClients\b/g, "People supported")
    .replace(/\bCLIENTS\b/g, "PEOPLE SUPPORTED")
    .replace(/\bclient\b/g, "person supported")
    .replace(/\bClient\b/g, "Person supported")
    .replace(/\bCLIENT\b/g, "PERSON SUPPORTED");
}

/** For prose the AI wrote itself: evaluation reports, follow-up suggestions. */
export function applyHouseStyle(input: string): string {
  return preferPersonSupported(stripEmDashes(input));
}

/** For the cleaned interview document: punctuation only, wording untouched. */
export function applyTranscriptStyle(input: string): string {
  return stripEmDashes(input);
}
