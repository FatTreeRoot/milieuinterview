import type { InterviewResponse } from "./types";

/**
 * Local mirror of an in-progress interview.
 *
 * Notes are written here on every keystroke and to the server on a timer. If
 * the connection drops, or the tab closes, the local copy is what brings the
 * interview back. It is cleared once the server has confirmed a save.
 */

const key = (interviewId: string) => `milieu-draft-${interviewId}`;

export type LocalDraft = {
  responses: InterviewResponse[];
  durationSeconds: number;
  savedAt: string;
};

export function writeLocalDraft(interviewId: string, draft: LocalDraft): void {
  try {
    localStorage.setItem(key(interviewId), JSON.stringify(draft));
  } catch {
    // Storage can be unavailable or full. The server save is the real path,
    // so this is a fallback that is allowed to fail quietly.
  }
}

export function readLocalDraft(interviewId: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(key(interviewId));
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(interviewId: string): void {
  try {
    localStorage.removeItem(key(interviewId));
  } catch {
    // Nothing to do.
  }
}

/** True when the local copy holds notes the server has not confirmed. */
export function localDraftIsNewer(
  local: LocalDraft | null,
  serverResponses: InterviewResponse[],
): boolean {
  if (!local) return false;
  const localText = local.responses
    .map((r) => `${r.questionId}:${r.notes}`)
    .join("|");
  const serverText = serverResponses
    .map((r) => `${r.questionId}:${r.notes}`)
    .join("|");
  return localText !== serverText && local.responses.some((r) => r.notes.trim());
}
