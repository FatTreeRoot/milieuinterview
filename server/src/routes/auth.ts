import type { FastifyInstance } from "fastify";
import { changePasswordSchema, loginSchema, registerSchema } from "@milieu/shared";
import { get, run, transaction } from "../db/index.js";
import { badRequest, parseBody, requireUser, unauthorized } from "../lib/http.js";
import type { CurrentUser } from "../lib/sessions.js";
import { hashPassword, verifyPassword } from "../lib/passwords.js";
import { createSession, currentUser, destroySession } from "../lib/sessions.js";
import { audit } from "../lib/audit.js";
import { id, now } from "../lib/ids.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Auth endpoints are the ones worth guessing at, so they get their own limit.
  const strict = {
    config: { rateLimit: { max: 10, timeWindow: "5 minutes" } },
  };

  app.get("/api/auth/me", async (request) => {
    return { user: currentUser(request) };
  });

  app.post("/api/auth/login", strict, async (request, reply) => {
    const body = parseBody(loginSchema, request.body);
    const row = get(
      "SELECT id, email, name, role, password_hash FROM users WHERE email = ?",
      body.email,
    );

    // Same message and similar timing whether the email exists or not, so the
    // endpoint cannot be used to discover which addresses are registered.
    const hash =
      (row?.["password_hash"] as string | undefined) ??
      "scrypt$131072$8$1$notarealsalt$notarealhash";
    const ok = await verifyPassword(body.password, hash);
    if (!row || !ok) throw unauthorized("That email or password is not right");

    const userId = row["id"] as string;
    createSession(userId, reply);
    audit(userId, "login", "user", userId);
    const user: CurrentUser = {
      id: userId,
      email: row["email"] as string,
      name: row["name"] as string,
      role: row["role"] as CurrentUser["role"],
    };
    return { user, ok: true };
  });

  app.post("/api/auth/register", strict, async (request, reply) => {
    const body = parseBody(registerSchema, request.body);

    const taken = get("SELECT id FROM users WHERE email = ?", body.email);
    if (taken) throw badRequest("Please check the highlighted fields", {
      email: "An account already uses this email",
    });

    const code = get(
      "SELECT id, active FROM access_codes WHERE code = ?",
      body.accessCode.trim().toUpperCase(),
    );
    if (!code || code["active"] !== 1) {
      throw badRequest("Please check the highlighted fields", {
        accessCode: "That access code is not valid",
      });
    }

    const userId = id();
    const passwordHash = await hashPassword(body.password);
    transaction(() => {
      run(
        `INSERT INTO users (id, email, name, role, password_hash, created_at)
         VALUES (?, ?, ?, 'staff', ?, ?)`,
        userId,
        body.email,
        body.name,
        passwordHash,
        now(),
      );
      run(
        "UPDATE access_codes SET uses = uses + 1 WHERE id = ?",
        code["id"] as string,
      );
    });
    audit(userId, "register", "user", userId, { via: "access_code" });
    createSession(userId, reply);
    const user: CurrentUser = {
      id: userId,
      email: body.email,
      name: body.name,
      role: "staff",
    };
    return { user, ok: true };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    destroySession(request, reply);
    return { ok: true };
  });

  app.post("/api/auth/password", strict, async (request) => {
    const user = requireUser(request);
    const body = parseBody(changePasswordSchema, request.body);
    const row = get("SELECT password_hash FROM users WHERE id = ?", user.id);
    const ok = await verifyPassword(
      body.currentPassword,
      (row?.["password_hash"] as string) ?? "",
    );
    if (!ok) {
      throw badRequest("Please check the highlighted fields", {
        currentPassword: "That is not your current password",
      });
    }
    run(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      await hashPassword(body.newPassword),
      user.id,
    );
    audit(user.id, "change_password", "user", user.id);
    return { ok: true };
  });
}
