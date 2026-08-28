# Milieu HR Interview Assistant

Internal web app for Milieu Family Services HR: run structured candidate
interviews, take notes during the conversation, and produce a cleaned interview
document and an AI evaluation report, both editable and exportable as PDFs.

## Layout

| Path      | What lives there                                                |
| --------- | --------------------------------------------------------------- |
| `shared/` | Types, zod schemas, and scoring/house-style rules used by both sides |
| `server/` | Fastify API, SQLite storage, AI calls, PDF rendering            |
| `client/` | React + Vite single-page app                                    |

## Requirements

Node 20 or newer. Node's built-in `node:sqlite` is the database driver, so
there are no native modules to compile.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev
```

`npm run dev` starts the API on port 3000 and the Vite dev server on port 5173,
which proxies `/api` through to the API.

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Run the API and the client together           |
| `npm run build`     | Build shared, client, then server             |
| `npm start`         | Run the built server (serves the built client)|
| `npm test`          | Run the test suite                            |
| `npm run typecheck` | Type-check every workspace                    |

## Configuration

See `.env.example`. `ANTHROPIC_API_KEY` powers the AI features; `SMTP_*` is
optional and the email features stay hidden until it is set.
