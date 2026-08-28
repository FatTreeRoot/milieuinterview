import { get, run } from "../db/index.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function getSetting(key: string): string | null {
  const row = get("SELECT value FROM settings WHERE key = ?", key);
  return row ? (row["value"] as string) : null;
}

export function setSetting(key: string, value: string): void {
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export const ORG_CONTEXT_KEY = "org_context";
export const RETENTION_MONTHS_KEY = "retention_months";

/** The file ships the seed; after first boot the database is authoritative. */
export function seedOrgContext(): void {
  if (getSetting(ORG_CONTEXT_KEY) !== null) return;
  const seed = readFileSync(join(here, "..", "ai", "org-context.md"), "utf8");
  setSetting(ORG_CONTEXT_KEY, seed);
}

export function orgContext(): string {
  return getSetting(ORG_CONTEXT_KEY) ?? "";
}

/** null disables the auto-purge. */
export function retentionMonths(): number | null {
  const raw = getSetting(RETENTION_MONTHS_KEY);
  if (raw === null || raw === "") return null;
  const months = Number(raw);
  return Number.isFinite(months) && months > 0 ? months : null;
}
