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
    logger: config.isTest
      ? false
      : config.isProduction
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
    await app.register(fastifyStatic, {
      root: clientDist,
      wildcard: false,
      setHeaders(reply, path) {
        // Asset filenames carry a content hash, so a given name always has the
        // same contents and can be cached indefinitely. index.html must not
        // be: it is what points at the current asset names, and a stale copy
        // asks for files a deploy has already replaced.
        if (path.endsWith("index.html")) {
          reply.header("Cache-Control", "no-cache");
        } else if (path.includes("assets")) {
          reply.header("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.status(404).send({ error: "Not found" });
      }
      // A missing asset must 404 rather than fall through. Asset filenames
      // carry a content hash, so after a deploy a browser holding the old
      // index.html asks for files that no longer exist. Answering those with
      // index.html hands back HTML where a module was expected, and the page
      // fails with a MIME type error instead of simply reloading.
      const path = request.url.split("?")[0] ?? "";
      if (path.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(path)) {
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
