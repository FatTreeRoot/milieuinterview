import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { accessCodeSchema, settingsSchema, updateUserSchema } from "@milieu/shared";
import { all, get, run } from "../db/index.js";
import { badRequest, parseBody, requireAdmin, requireUser } from "../lib/http.js";
import { accessCode as generateCode, id, now } from "../lib/ids.js";
import { audit } from "../lib/audit.js";
import {
  ORG_CONTEXT_KEY,
  RETENTION_MONTHS_KEY,
  getSetting,
  retentionMonths,
  setSetting,
} from "../lib/settings.js";
import { emailEnabled } from "../config.js";
import { aiEnabled } from "../config.js";

const idParams = z.object({ id: z.string().min(1) });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /** What the UI needs to know to show or hide optional features. */
  app.get("/api/capabilities", async (request) => {
    requireUser(request);
    return { ai: aiEnabled, email: emailEnabled };
  });

  // --- Access codes ---

  app.get("/api/admin/access-codes", async (request) => {
    requireAdmin(request);
    return {
      codes: all(
        `SELECT c.id, c.code, c.label, c.active, c.uses, c.created_at,
                u.name AS created_by_name
           FROM access_codes c
           LEFT JOIN users u ON u.id = c.created_by
          ORDER BY c.created_at DESC`,
      ).map((row) => ({
        id: row["id"],
        code: row["code"],
        label: row["label"],
        active: row["active"] === 1,
        uses: row["uses"],
        createdAt: row["created_at"],
        createdByName: row["created_by_name"] ?? null,
      })),
    };
  });

  app.post("/api/admin/access-codes", async (request) => {
    const admin = requireAdmin(request);
    const body = parseBody(accessCodeSchema, request.body);
    const codeId = id();
    const code = generateCode();
    run(
      `INSERT INTO access_codes (id, code, label, active, uses, created_by, created_at)
       VALUES (?, ?, ?, 1, 0, ?, ?)`,
      codeId,
      code,
      body.label,
      admin.id,
      now(),
    );
    audit(admin.id, "create", "access_code", codeId, { label: body.label });
    return { code: { id: codeId, code, label: body.label, active: true, uses: 0 } };
  });

  app.post("/api/admin/access-codes/:id/active", async (request) => {
    const admin = requireAdmin(request);
    const { id: codeId } = idParams.parse(request.params);
    const { active } = parseBody(z.object({ active: z.boolean() }), request.body);
    run("UPDATE access_codes SET active = ? WHERE id = ?", active ? 1 : 0, codeId);
    audit(admin.id, active ? "enable" : "disable", "access_code", codeId);
    return { ok: true };
  });

  app.delete("/api/admin/access-codes/:id", async (request) => {
    const admin = requireAdmin(request);
    const { id: codeId } = idParams.parse(request.params);
    run("DELETE FROM access_codes WHERE id = ?", codeId);
    audit(admin.id, "delete", "access_code", codeId);
    return { ok: true };
  });

  // --- Users ---

  app.get("/api/admin/users", async (request) => {
    requireAdmin(request);
    return {
      users: all(
        "SELECT id, email, name, role, created_at FROM users ORDER BY created_at",
      ).map((row) => ({
        id: row["id"],
        email: row["email"],
        name: row["name"],
        role: row["role"],
        createdAt: row["created_at"],
      })),
    };
  });

  app.put("/api/admin/users/:id/role", async (request) => {
    const admin = requireAdmin(request);
    const { id: userId } = idParams.parse(request.params);
    const body = parseBody(updateUserSchema, request.body);

    // Losing the last admin would lock everyone out of user management.
    if (body.role !== "admin") {
      const admins = get(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'",
      );
      const target = get("SELECT role FROM users WHERE id = ?", userId);
      if (target?.["role"] === "admin" && (admins?.["count"] as number) <= 1) {
        throw badRequest("This is the only admin account. Promote someone else first.");
      }
    }

    run("UPDATE users SET role = ? WHERE id = ?", body.role, userId);
    audit(admin.id, "set_role", "user", userId, { role: body.role });
    return { ok: true };
  });

  app.delete("/api/admin/users/:id", async (request) => {
    const admin = requireAdmin(request);
    const { id: userId } = idParams.parse(request.params);
    if (userId === admin.id) {
      throw badRequest("You cannot delete your own account");
    }
    const target = get("SELECT role FROM users WHERE id = ?", userId);
    if (target?.["role"] === "admin") {
      const admins = get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
      if ((admins?.["count"] as number) <= 1) {
        throw badRequest("This is the only admin account");
      }
    }
    run("DELETE FROM users WHERE id = ?", userId);
    audit(admin.id, "delete", "user", userId);
    return { ok: true };
  });

  // --- Settings ---

  app.get("/api/admin/settings", async (request) => {
    requireAdmin(request);
    return {
      orgContext: getSetting(ORG_CONTEXT_KEY) ?? "",
      retentionMonths: retentionMonths(),
    };
  });

  app.put("/api/admin/settings", async (request) => {
    const admin = requireAdmin(request);
    const body = parseBody(settingsSchema, request.body);
    if (body.orgContext !== undefined) {
      setSetting(ORG_CONTEXT_KEY, body.orgContext);
      audit(admin.id, "update", "settings", ORG_CONTEXT_KEY);
    }
    if (body.retentionMonths !== undefined) {
      setSetting(
        RETENTION_MONTHS_KEY,
        body.retentionMonths === null ? "" : String(body.retentionMonths),
      );
      audit(admin.id, "update", "settings", RETENTION_MONTHS_KEY, {
        months: body.retentionMonths,
      });
    }
    return { ok: true };
  });

  // --- Audit log ---

  app.get("/api/admin/audit", async (request) => {
    requireAdmin(request);
    const limit = Math.min(
      Number((request.query as { limit?: string }).limit ?? 200),
      500,
    );
    return {
      entries: all(
        `SELECT a.*, u.name AS user_name
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
          ORDER BY a.created_at DESC LIMIT ?`,
        limit,
      ).map((row) => ({
        id: row["id"],
        userName: row["user_name"] ?? "Removed user",
        action: row["action"],
        entity: row["entity"],
        entityId: row["entity_id"],
        detail: row["detail"],
        createdAt: row["created_at"],
      })),
    };
  });

  // --- AI spend ---

  app.get("/api/admin/usage", async (request) => {
    requireAdmin(request);
    return {
      byFeature: all(
        `SELECT feature, model, COUNT(*) AS calls,
                SUM(input_tokens) AS input_tokens,
                SUM(output_tokens) AS output_tokens,
                SUM(cache_read_tokens) AS cache_read_tokens,
                SUM(cost_usd) AS cost_usd
           FROM ai_usage GROUP BY feature, model ORDER BY cost_usd DESC`,
      ),
      byMonth: all(
        `SELECT substr(created_at, 1, 7) AS month,
                COUNT(*) AS calls, SUM(cost_usd) AS cost_usd
           FROM ai_usage GROUP BY month ORDER BY month DESC LIMIT 12`,
      ),
    };
  });
}
