import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodSchema } from "zod";
import { currentUser, type CurrentUser } from "./sessions.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, d);
export const unauthorized = (m = "Please sign in") => new HttpError(401, m);
export const forbidden = (m = "You do not have access to this") =>
  new HttpError(403, m);
export const notFound = (m = "Not found") => new HttpError(404, m);

/** Throws 401 unless a valid session is present. */
export function requireUser(request: FastifyRequest): CurrentUser {
  const user = currentUser(request);
  if (!user) throw unauthorized();
  return user;
}

export function requireAdmin(request: FastifyRequest): CurrentUser {
  const user = requireUser(request);
  if (user.role !== "admin") throw forbidden("This needs an admin account");
  return user;
}

/** Validates a request body, turning zod issues into a 400 the UI can show. */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_";
      fields[path] ??= issue.message;
    }
    throw badRequest("Please check the highlighted fields", fields);
  }
  return result.data;
}

export function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof HttpError) {
    return reply
      .status(error.status)
      .send({ error: error.message, details: error.details ?? null });
  }
  reply.log.error({ err: error }, "unhandled error");
  return reply.status(500).send({ error: "Something went wrong" });
}
