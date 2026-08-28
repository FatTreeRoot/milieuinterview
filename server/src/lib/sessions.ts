import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@milieu/shared";
import { get, run } from "../db/index.js";
import { config } from "../config.js";
import { id, now } from "./ids.js";

export const SESSION_COOKIE = "milieu_session";
const SESSION_DAYS = 14;

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export function createSession(userId: string, reply: FastifyReply): void {
  const sessionId = id();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  run(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    sessionId,
    userId,
    expires.toISOString(),
    now(),
  );
  reply.setCookie(SESSION_COOKIE, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    signed: true,
    expires,
  });
}

export function destroySession(request: FastifyRequest, reply: FastifyReply): void {
  const sessionId = readSessionId(request);
  if (sessionId) run("DELETE FROM auth_sessions WHERE id = ?", sessionId);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

function readSessionId(request: FastifyRequest): string | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value ? unsigned.value : null;
}

export function currentUser(request: FastifyRequest): CurrentUser | null {
  const sessionId = readSessionId(request);
  if (!sessionId) return null;
  const row = get(
    `SELECT u.id, u.email, u.name, u.role, s.expires_at
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
    sessionId,
  );
  if (!row) return null;
  if (new Date(row["expires_at"] as string) < new Date()) {
    run("DELETE FROM auth_sessions WHERE id = ?", sessionId);
    return null;
  }
  return {
    id: row["id"] as string,
    email: row["email"] as string,
    name: row["name"] as string,
    role: row["role"] as Role,
  };
}

export function purgeExpiredSessions(): void {
  run("DELETE FROM auth_sessions WHERE expires_at < ?", now());
}
