import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import { migrations } from "./schema.js";

export type Row = Record<string, unknown>;

function open(): DatabaseSync {
  if (config.databasePath !== ":memory:") {
    mkdirSync(dirname(config.databasePath), { recursive: true });
  }
  const database = new DatabaseSync(config.databasePath);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  return database;
}

export const db = open();

export function migrate(): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare("SELECT name FROM schema_migrations").all() as Row[]).map(
      (r) => r["name"] as string,
    ),
  );
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      ).run(migration.name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${migration.name} failed: ${String(error)}`);
    }
  }
}

/** Runs `fn` in a transaction, rolling back if it throws. */
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function all(sql: string, ...params: unknown[]): Row[] {
  return db.prepare(sql).all(...(params as never[])) as Row[];
}

export function get(sql: string, ...params: unknown[]): Row | undefined {
  return db.prepare(sql).get(...(params as never[])) as Row | undefined;
}

export function run(sql: string, ...params: unknown[]): void {
  db.prepare(sql).run(...(params as never[]));
}

/** SQLite has no boolean type; it stores 0 and 1. */
export function toBool(value: unknown): boolean {
  return value === 1 || value === true;
}

export function fromBool(value: boolean): number {
  return value ? 1 : 0;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
