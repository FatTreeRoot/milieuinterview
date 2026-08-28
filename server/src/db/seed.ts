import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_MIN_NOTES, NO_MIN_NOTES, type InputKind } from "@milieu/shared";
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
  minNotes?: number;
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
             (id, type_id, sort, text, answer_key, input_kind, input_config, min_notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          id(),
          typeId,
          index,
          question.text,
          question.answerKey,
          question.inputKind,
          JSON.stringify(question.inputConfig ?? {}),
          question.minNotes ??
            (question.inputKind === "yes_no" ? NO_MIN_NOTES : DEFAULT_MIN_NOTES),
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

/**
 * Makes sure there is a way for the first staff member to register.
 *
 * When REGISTRATION_ACCESS_CODE is set it is treated as authoritative: the
 * code is created if missing and reactivated if it was switched off, every
 * boot. An operator who sets that variable expects that code to work, and
 * before this it did nothing whenever any other code already existed.
 *
 * With the variable unset, one code is generated on first boot and logged,
 * and later boots leave the table alone so codes an admin has turned off in
 * the app stay off.
 */
export function seedAccessCode(log: { info: (msg: string) => void }): void {
  const configured = config.registrationAccessCode;

  if (configured) {
    const existing = get("SELECT id, active FROM access_codes WHERE code = ?", configured);
    if (!existing) {
      run(
        `INSERT INTO access_codes (id, code, label, active, uses, created_by, created_at)
         VALUES (?, ?, ?, 1, 0, NULL, ?)`,
        id(),
        configured,
        "Set by REGISTRATION_ACCESS_CODE",
        now(),
      );
      log.info("Registration access code from the environment is ready.");
    } else if (existing["active"] !== 1) {
      run("UPDATE access_codes SET active = 1 WHERE id = ?", existing["id"]);
      log.info("Reactivated the registration access code from the environment.");
    }
    return;
  }

  const count = get("SELECT COUNT(*) AS count FROM access_codes");
  if ((count?.["count"] as number) > 0) return;

  const generated = accessCode();
  run(
    `INSERT INTO access_codes (id, code, label, active, uses, created_by, created_at)
     VALUES (?, ?, ?, 1, 0, NULL, ?)`,
    id(),
    generated,
    "Initial registration code",
    now(),
  );
  log.info(`Generated a registration access code: ${generated}`);
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
