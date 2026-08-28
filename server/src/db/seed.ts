import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { InputKind } from "@milieu/shared";
import { all, get, run, transaction } from "./index.js";
import { accessCode, id, now } from "../lib/ids.js";
import { hashPassword } from "../lib/passwords.js";
import { config } from "../config.js";
import { seedOrgContext } from "../lib/settings.js";

const here = dirname(fileURLToPath(import.meta.url));

type SeedQuestion = {
  text: string;
  answerKey: string | null;
  inputKind: InputKind;
  inputConfig: Record<string, unknown>;
};

type SeedType = {
  name: string;
  description: string | null;
  passThreshold: number;
  sort: number;
  questions: SeedQuestion[];
};

/**
 * Seeds only when the table is empty. After first boot the database is the
 * source of truth and HR edits the library in the app, so re-running this
 * must never overwrite their work.
 */
export function seedInterviewLibrary(): void {
  const existing = get("SELECT COUNT(*) AS count FROM interview_types");
  if ((existing?.["count"] as number) > 0) return;

  const path = join(here, "..", "data", "interview-library.json");
  const library = JSON.parse(readFileSync(path, "utf8")) as SeedType[];

  transaction(() => {
    for (const type of library) {
      const typeId = id();
      run(
        `INSERT INTO interview_types
           (id, name, description, pass_threshold, sort, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        typeId,
        type.name,
        type.description,
        type.passThreshold,
        type.sort,
        now(),
        now(),
      );
      type.questions.forEach((question, index) => {
        run(
          `INSERT INTO questions
             (id, type_id, sort, text, answer_key, input_kind, input_config)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          id(),
          typeId,
          index,
          question.text,
          question.answerKey,
          question.inputKind,
          JSON.stringify(question.inputConfig ?? {}),
        );
      });
    }
  });
}

/** Creates the first admin from env vars, only while no users exist. */
export async function seedFirstAdmin(log: {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}): Promise<void> {
  const existing = get("SELECT COUNT(*) AS count FROM users");
  if ((existing?.["count"] as number) > 0) return;

  const { email, password } = config.firstAdmin;
  if (!email || !password) {
    log.warn(
      "No users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first admin account.",
    );
    return;
  }
  run(
    `INSERT INTO users (id, email, name, role, password_hash, created_at)
     VALUES (?, ?, ?, 'admin', ?, ?)`,
    id(),
    email.toLowerCase(),
    "Administrator",
    await hashPassword(password),
    now(),
  );
  log.info(`Created the first admin account for ${email}.`);
}

/** Seeds one access code so the first staff member can register. */
export function seedAccessCode(log: { info: (msg: string) => void }): void {
  const existing = get("SELECT COUNT(*) AS count FROM access_codes");
  if ((existing?.["count"] as number) > 0) return;

  const code = config.registrationAccessCode ?? accessCode();
  run(
    `INSERT INTO access_codes (id, code, label, active, uses, created_by, created_at)
     VALUES (?, ?, ?, 1, 0, NULL, ?)`,
    id(),
    code,
    "Initial registration code",
    now(),
  );
  if (!config.registrationAccessCode) {
    log.info(`Generated a registration access code: ${code}`);
  }
}

export function seedAll(log: {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}): Promise<void> {
  seedOrgContext();
  seedInterviewLibrary();
  seedAccessCode(log);
  const types = all("SELECT id FROM interview_types").length;
  log.info(`Interview library ready: ${types} types.`);
  return seedFirstAdmin(log);
}
