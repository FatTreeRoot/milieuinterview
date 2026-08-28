# Node 20 or newer is required: the database driver is Node's built-in
# node:sqlite, which is why this image needs no build toolchain and no
# native modules.
FROM node:24-slim AS build

WORKDIR /app

# Manifests first, so a dependency install is only redone when they change.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY . .
RUN npm run build

# Drops the dev dependencies from the tree that gets copied forward.
RUN npm prune --omit=dev


FROM node:24-slim AS runtime

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/app.db
ENV PORT=3000

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/package.json
# The seed library and the agency context are read at runtime, so they ship
# as files rather than being compiled in.
COPY --from=build /app/server/src/data/interview-library.json ./server/dist/data/interview-library.json
COPY --from=build /app/server/src/ai/org-context.md ./server/dist/ai/org-context.md
COPY --from=build /app/client/dist ./client/dist

# The SQLite file lives on a volume mounted here.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
