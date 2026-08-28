import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { migrate } from "./db/index.js";
import { seedAll } from "./db/seed.js";
import { sendError } from "./lib/http.js";
import { purgeExpiredSessions } from "./lib/sessions.js";
import { purgeOldInterviews } from "./lib/stats.js";
import { authRoutes } from "./routes/auth.js";
import { libraryRoutes } from "./routes/library.js";
import { interviewRoutes } from "./routes/interviews.js";
import { adminRoutes } from "./routes/admin.js";
import { exportRoutes } from "./routes/exports.js";

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
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });

  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  app.get("/healthz", async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(libraryRoutes);
  await app.register(interviewRoutes);
  await app.register(adminRoutes);
  await app.register(exportRoutes);

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

  // Retention runs at boot and daily after that. Unref'd so it never keeps
  // the process alive on shutdown.
  const maintenance = () => {
    purgeExpiredSessions();
    purgeOldInterviews({ info: (m) => app.log.info(m) });
  };
  maintenance();
  setInterval(maintenance, 24 * 60 * 60 * 1000).unref();

  await app.listen({ port: config.port, host: config.host });
}
