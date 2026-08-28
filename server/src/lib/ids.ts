import { randomBytes, randomUUID } from "node:crypto";

export function id(): string {
  return randomUUID();
}

/** Human-typeable access code. No look-alike characters. */
export function accessCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
    if (i === 3 || i === 7) out += "-";
  }
  return out;
}

export function now(): string {
  return new Date().toISOString();
}
