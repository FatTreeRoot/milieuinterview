import { run } from "../db/index.js";
import { id, now } from "./ids.js";

/** Records who did what. Admins read this in Settings. */
export function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  detail?: unknown,
): void {
  run(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id(),
    userId,
    action,
    entity,
    entityId,
    detail === undefined ? null : JSON.stringify(detail),
    now(),
  );
}
