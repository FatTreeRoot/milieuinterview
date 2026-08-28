# Milieu HR Interview Assistant

Internal web app for Milieu Family Services HR. Run a structured interview from
a library of question sets, take notes during the conversation, and get back a
cleaned interview document and an evaluation report, both editable in the app
and exportable as PDFs.

## What it does

**The library.** Fourteen interview types and 360 questions, taken from
Milieu's existing Word forms, are loaded on first boot. Fifty-two questions
carry their answer key. HR can edit, reorder, add, archive, duplicate and
delete types in the app, or import a new one from a Word document.

**Running an interview.** One question at a time with the next one previewed in
the corner, a jump list, and a per-question input suited to the question (yes
or no, a rating scale, a checklist) above the notes box. The interviewer can
rate each answer out of 5 and flag anything concerning. Notes save
continuously, and are mirrored to the browser so a dropped connection or a
closed tab does not lose the conversation.

**Live follow-up suggestions.** While notes are being typed, the app may
suggest one follow-up question. It is deliberately quiet: it appears only when
typing has stopped, enough new text exists and a cooldown has passed, and the
model is instructed to stay silent unless a follow-up is genuinely warranted.

**After the interview.** Two AI passes run. The first tidies grammar, spelling
and formatting while leaving the interviewer's wording and meaning alone. The
second produces a score out of 10 against the type's pass threshold, states
whether the candidate is above or below it, justifies each conclusion by
pointing at the question it came from, and flags concerns and follow-ups. Both
documents are editable in the app and export as branded PDFs.

**The interviewer's own score.** The evaluation is a starting point, not a
verdict. Whoever ran the interview can enter their own score, and it is used in
place of the AI's everywhere an outcome or statistic appears.

**Also included.** Full interview history with search and CSV export, hiring
statistics, an activity log, access-code registration, admin and staff roles,
optional emailing of the PDFs, and an optional retention policy that removes
old candidate data automatically.

## Layout

| Path      | What lives there                                                     |
| --------- | -------------------------------------------------------------------- |
| `shared/` | Types, schemas, and the scoring and house-style rules both sides use  |
| `server/` | Fastify API, SQLite storage, AI calls, PDF rendering                  |
| `client/` | React and Vite single-page app                                        |

## Requirements

Node 20 or newer. The database driver is Node's built-in `node:sqlite`, so
there are no native modules to compile anywhere in the stack.

## Running it locally

```bash
npm install
cp .env.example .env
npm run dev
```

Fill in `.env` first. At a minimum set `SESSION_SECRET`, `ADMIN_EMAIL` and
`ADMIN_PASSWORD`; without `ANTHROPIC_API_KEY` the app runs fine but the AI
features stay switched off and say so.

`npm run dev` starts the API on port 3000 and the client on port 5173, which
proxies `/api` through to the API. Open http://localhost:5173.

## Scripts

| Command             | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Run the API and the client together              |
| `npm run build`     | Build shared, then client, then server           |
| `npm start`         | Run the built server, which also serves the client|
| `npm test`          | Run the test suite                               |
| `npm run typecheck` | Type-check every workspace                       |

## Configuration

Everything is read from the environment. See `.env.example`.

| Variable                   | Required | What it does                                              |
| -------------------------- | -------- | --------------------------------------------------------- |
| `SESSION_SECRET`           | Yes      | Signs session cookies. The server refuses to start in production without it. |
| `DATABASE_PATH`            | Yes      | Where the SQLite file lives. `/data/app.db` in the container. |
| `ADMIN_EMAIL`              | First run| Creates the first admin, only while no users exist.       |
| `ADMIN_PASSWORD`           | First run| Password for that admin. Change it after signing in.      |
| `REGISTRATION_ACCESS_CODE` | No       | Seeds one access code so the first staff member can register. One is generated and logged if omitted. |
| `ANTHROPIC_API_KEY`        | No       | Turns on the AI features.                                 |
| `SMTP_*`                   | No       | Turns on emailing the PDFs.                               |

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Deploying to Coolify

The app is one container with one volume. No database service to run alongside
it, and nothing tied to a particular host.

1. In Coolify, create a new resource and point it at this Git repository.
2. Choose **Dockerfile** as the build pack. The `Dockerfile` at the repository
   root is the whole build.
3. Set the port to **3000**.
4. Add a **persistent volume** mounted at `/data`. This holds the database. If
   you skip this, every deploy starts from an empty app.
5. Add the environment variables from the table above. `DATABASE_PATH` is
   already `/data/app.db` in the image, so it only needs setting to override it.
6. Set the health check path to `/healthz` if Coolify asks for one. The image
   also declares its own `HEALTHCHECK`.
7. Deploy, then sign in as `ADMIN_EMAIL` and change the password.

On first boot the app creates the admin, seeds the interview library and either
uses `REGISTRATION_ACCESS_CODE` or generates a code and writes it to the logs.
Later deploys leave all of that alone: seeding only ever runs against empty
tables, so edits HR makes in the app survive.

To check the production image locally before deploying:

```bash
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))") ADMIN_PASSWORD=changeme12345 docker compose up --build
```

## Costs

Model choice follows what each job needs. The live follow-up suggestion fires
repeatedly and only has to spot an obvious gap, so it runs on Claude Haiku with
a small output cap. The cleanup and evaluation passes run once each per
interview and carry the judgement that matters, so they run on Claude Sonnet.

The house rules and the agency context are sent as one cached block, so repeat
calls within an interview re-read them rather than paying full input price for
the same text. The handbooks themselves are never sent: a short summary
distilled from them is, and admins can edit it in Settings.

Every call is costed and recorded. Settings shows the spend by feature and by
month.

## Where the seeded content came from

`server/src/data/` holds the interview library and the scripts that built it
from Milieu's Word forms, with notes on how the extraction works. The agency
context distilled from the handbooks is `server/src/ai/org-context.md`.
