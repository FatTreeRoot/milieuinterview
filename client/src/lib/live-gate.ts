/**
 * Rate limiting for the two live AI calls made while an interviewer types.
 *
 * Each call costs money, so one only fires when the interviewer has stopped
 * typing, has written a meaningful amount since the last call, and has left
 * enough time since it. The idle part is a debounce in the session component;
 * this is the rest.
 */

/** Where a live call last happened: when, and how long the notes were. */
export type LiveGate = { at: number; chars: number };

/**
 * A gate that has never fired. The time is negative infinity rather than zero
 * so that "no call yet" is always outside the cooldown on its own terms,
 * instead of relying on the clock being a large number.
 */
export const freshGate = (): LiveGate => ({
  at: Number.NEGATIVE_INFINITY,
  chars: 0,
});

/**
 * Decides whether a live call may fire, and records it in the gate if so.
 *
 * The character count is a mark of where the last call happened rather than a
 * high-water mark. An interviewer who deletes a sentence re-baselines to the
 * shorter text instead of having to out-type what they removed before the AI
 * will look again, which used to silence it for the rest of the question.
 */
export function claimLiveCall(
  gate: { current: LiveGate },
  notes: string,
  minNewChars: number,
  cooldownMs: number,
  now: number = Date.now(),
): boolean {
  if (notes.length < gate.current.chars) {
    gate.current = { ...gate.current, chars: notes.length };
  }
  if (now - gate.current.at < cooldownMs) return false;
  if (notes.length - gate.current.chars < minNewChars) return false;
  gate.current = { at: now, chars: notes.length };
  return true;
}
