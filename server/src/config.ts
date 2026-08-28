import { randomBytes } from "node:crypto";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

function sessionSecret(): string {
  const configured = optional("SESSION_SECRET");
  if (configured) return configured;
  if (isProduction) {
    throw new Error(
      "SESSION_SECRET must be set in production. Generate one with:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  // Dev only. Regenerating this on restart just invalidates open sessions.
  return randomBytes(48).toString("base64url");
}

const smtpHost = optional("SMTP_HOST");

export const config = {
  isProduction,
  isTest,
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  databasePath: process.env.DATABASE_PATH ?? "./data/app.db",
  sessionSecret: sessionSecret(),

  /** Created on first boot only, when the users table is empty. */
  firstAdmin: {
    email: optional("ADMIN_EMAIL"),
    password: optional("ADMIN_PASSWORD"),
  },
  /** Optional. Seeds one access code so the first staff member can register. */
  registrationAccessCode: optional("REGISTRATION_ACCESS_CODE"),

  anthropicApiKey: optional("ANTHROPIC_API_KEY"),

  /** Email features stay hidden in the UI until SMTP is configured. */
  smtp: smtpHost
    ? {
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        user: optional("SMTP_USER"),
        pass: optional("SMTP_PASS"),
        from: optional("SMTP_FROM") ?? optional("SMTP_USER") ?? "",
      }
    : null,
} as const;

export const aiEnabled = Boolean(config.anthropicApiKey);
export const emailEnabled = config.smtp !== null;
