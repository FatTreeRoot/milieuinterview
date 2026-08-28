/**
 * Fills in the interview library's answer keys.
 *
 * Most of Milieu's paper forms list questions with no guidance on what a
 * strong answer covers, and the three that do have keys are written in
 * different styles. This writes a key for every question and rewrites the
 * existing ones in one consistent voice, so scoring has something to work
 * against and interviewers have something to look at during the conversation.
 *
 * Existing keys are treated as source material, not as something to replace:
 * they came from Milieu's own practice and their substance is preserved.
 *
 * Writes to the database and to the seed file, so a fresh deployment starts
 * with the same keys. HR can edit any of it afterwards in the app.
 *
 * Usage:
 *   node scripts/generate-answer-keys.mjs --dry-run   # one type, print only
 *   node scripts/generate-answer-keys.mjs             # all types, writes
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

const MODEL = process.env.ANSWER_KEY_MODEL ?? "claude-opus-5";
const PRICING = {
  "claude-opus-5": { input: 5, output: 25, cached: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cached: 0.2 },
};

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set. Run with the .env loaded:");
  console.error("  node --env-file=.env scripts/generate-answer-keys.mjs");
  process.exit(1);
}

const db = new DatabaseSync(process.env.DATABASE_PATH ?? join(root, "data", "app.db"));
const client = new Anthropic({ apiKey });

const orgContext =
  db.prepare("SELECT value FROM settings WHERE key = 'org_context'").get()?.value ??
  readFileSync(join(root, "server", "src", "ai", "org-context.md"), "utf8");

const SYSTEM = `You are helping HR at Milieu Family Services write answer keys for their interview questions.

${orgContext}

An answer key lists what a strong answer covers. An interviewer reads it while listening, and it is what the candidate's response gets scored against, so it has to be concrete enough to judge an answer by.

For each question write 3 to 6 short bullets. Each bullet is one specific thing a strong candidate would say or demonstrate. Write them the way an experienced social services practitioner would: grounded in day to day practice, not in theory or generic interview advice.

Rules:
- Ground the key in the reality of this work: person centred practice, trauma informed support, professional boundaries, de-escalation that avoids power struggles, knowing when to escalate to a manager and when to report externally, documentation, and the candidate's own self awareness and regulation.
- Where a question is about a Milieu specific term or process, reflect what that term means in the reference above. Do not invent policy detail that is not there. Prefer describing the practice over naming a document.
- For a factual or intake question such as availability, a licence, or a conditions check, keep the key to what the interviewer needs to confirm or follow up on. Do not pad it into a behavioural rubric.
- Never write "client" for a person supported. Write "person supported" or "people supported".
- Never use em dashes.
- Be careful and non judgemental in wording. These questions concern vulnerable children, youth and adults.
- Do not restate the question. Do not write preamble. Bullets only.

Some questions arrive with an existing key from Milieu's own paper forms. Treat that as the source of truth for content: keep every point it makes, clarify the wording, merge duplicates, and add anything clearly missing. Do not discard Milieu's own guidance.

Return JSON only, no other text:
{"keys":[{"id":"<question id exactly as given>","answerKey":"- point\\n- point\\n- point"}]}

Return one entry for every question you are given, in the same order.`;

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function userMessage(typeName, questions) {
  const blocks = questions.map((q, i) => {
    const parts = [`[${q.id}] Question ${i + 1}: ${q.text}`];
    if (q.answer_key) {
      parts.push(`Existing key from Milieu's form:\n${q.answer_key}`);
    }
    return parts.join("\n");
  });
  return `Interview type: ${typeName}\n\n${blocks.join("\n\n")}`;
}

function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("could not parse the response as JSON");
  }
}

/** House style, enforced here rather than trusted to the prompt. */
function tidy(text) {
  return text
    .replace(/(\d)\s*[—―]\s*(\d)/g, "$1-$2")
    .replace(/\s*[—―]\s*/g, ", ")
    .replace(/\bclients\b/g, "people supported")
    .replace(/\bClients\b/g, "People supported")
    .replace(/\bclient\b/g, "person supported")
    .replace(/\bClient\b/g, "Person supported")
    .trim();
}

const types = db
  .prepare("SELECT id, name FROM interview_types ORDER BY sort")
  .all();

let totals = { input: 0, output: 0, cached: 0, questions: 0, calls: 0 };

for (const type of types) {
  const questions = db
    .prepare("SELECT id, text, answer_key, sort FROM questions WHERE type_id = ? ORDER BY sort")
    .all(type.id);
  if (questions.length === 0) continue;

  // Batched so no single response runs long enough to get truncated.
  for (const batch of chunk(questions, 12)) {
    // This is a well specified writing task rather than a reasoning problem,
    // and thinking tokens bill as output, so effort is capped at medium.
    // Leaving thinking on but shallower is cheaper and safer than turning it
    // off, which can leak reasoning into the visible response.
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMessage(type.name, batch) }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = parseJson(text);

    const byId = new Map(batch.map((q) => [q.id, q]));
    let written = 0;
    for (const entry of parsed.keys ?? []) {
      if (!byId.has(entry.id) || !entry.answerKey?.trim()) continue;
      const key = tidy(entry.answerKey);
      if (!dryRun) {
        db.prepare("UPDATE questions SET answer_key = ? WHERE id = ?").run(key, entry.id);
      }
      written += 1;
      if (dryRun && written <= 3) {
        console.log(`\n--- ${byId.get(entry.id).text}\n${key}`);
      }
    }

    const usage = message.usage;
    totals.input += usage.input_tokens ?? 0;
    totals.output += usage.output_tokens ?? 0;
    totals.cached += usage.cache_read_input_tokens ?? 0;
    totals.questions += written;
    totals.calls += 1;

    console.log(
      `${type.name}: ${written}/${batch.length} keys` +
        (dryRun ? " (dry run, nothing written)" : ""),
    );

    if (dryRun) break;
  }
  if (dryRun) break;
}

const price = PRICING[MODEL] ?? PRICING["claude-sonnet-5"];
const cost =
  (totals.input * price.input +
    totals.cached * price.cached +
    totals.output * price.output) /
  1_000_000;

if (!dryRun) {
  // Recorded like any other AI call, so it shows up in Settings.
  db.prepare(
    `INSERT INTO ai_usage (id, interview_id, feature, model, input_tokens,
       output_tokens, cache_read_tokens, cost_usd, created_at)
     VALUES (?, NULL, 'answer_keys', ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    MODEL,
    totals.input,
    totals.output,
    totals.cached,
    cost,
    new Date().toISOString(),
  );

  // Mirror into the seed file so a fresh deployment starts with these keys.
  const seedPath = join(root, "server", "src", "data", "interview-library.json");
  const library = JSON.parse(readFileSync(seedPath, "utf8"));
  for (const seedType of library) {
    const row = types.find((t) => t.name === seedType.name);
    if (!row) continue;
    const rows = db
      .prepare("SELECT text, answer_key FROM questions WHERE type_id = ? ORDER BY sort")
      .all(row.id);
    seedType.questions.forEach((question, index) => {
      const match = rows[index];
      if (match && match.answer_key) question.answerKey = match.answer_key;
    });
  }
  writeFileSync(seedPath, JSON.stringify(library, null, 2) + "\n", "utf8");
  console.log("\nSeed file updated.");
}

console.log(
  `\n${totals.calls} calls, ${totals.questions} keys written.\n` +
    `Tokens: ${totals.input} in, ${totals.cached} cached, ${totals.output} out.\n` +
    `Cost: $${cost.toFixed(2)} on ${MODEL}.`,
);
