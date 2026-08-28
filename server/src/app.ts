import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { migrate } from "./db/index.js";
import { seedAll } from "./db/seed.js";
import { sendError } from "./lib/http.js";
import { purgeExpiredSessions } from "./lib/sessions.js";
import { authRoutes } from "./routes/auth.js";

const here = dirname(fileURLToPath(import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isProduction
      ? true
      : { transport: { target: "pino-pretty", options: { colorize: true } } },
    bodyLimit: 8 * 1024 * 1024,
  });

  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  app.get("/healthz", async () => ({ ok: true }));

  await app.register(authRoutes);

  // In production the API also serves the built client. Any path the API does
  // not own falls through to index.html so client-side routes work on reload.
  const clientDist = join(here, "..", "..", "client", "dist");
  if (config.isProduction && existsSync(clientDist)) {
    const fastifyStatic = (await import("@fastify/static")).default;
    await app.register(fastifyStatic, { root: clientDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.status(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

export async function start(): Promise<void> {
  migrate();
  const app = await buildApp();
  await seedAll({
    info: (m) => app.log.info(m),
    warn: (m) => app.log.warn(m),
  });
  purgeExpiredSessions();

  await app.listen({ port: config.port, host: config.host });
}
