/**
 * Second pass over the note minimums.
 *
 * The first pass exempted only questions the paper forms had marked with
 * Yes/No boxes. Reading all 341 remaining questions turned up more that a
 * 120 character minimum does not suit: credential and availability checks,
 * one word answers, closing courtesies, and lines that are instructions to
 * the interviewer rather than questions at all.
 *
 * Behavioural, scenario and knowledge questions are untouched.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";

const db = new DatabaseSync("./data/app.db");

const EXEMPT = [
  // Contact details and logistics
  ["4342a851", "reference contact"],
  ["f4dbd2c8", "secondary job"],
  ["5324097b", "upcoming vacation"],
  ["f34a47ae", "start date"],
  ["609cd5ee", "availability commitments"],
  ["ee48f9d1", "availability commitments"],
  ["2f697e99", "lived in other provinces"],
  ["eb207daa", "lived outside Canada"],

  // Credentials, licences and training checklists
  ["222f5740", "driver licence"],
  ["65761912", "certificates held"],
  ["5abd3008", "requirements held"],
  ["c62d33ea", "training held"],
  ["32f0db51", "training held"],
  ["55076e95", "access to vehicle"],
  ["237ff2b3", "class 5 licence"],
  ["1f0be9c4", "years in maintenance"],
  ["cb7f46ce", "training completed"],
  ["ec471f16", "HVAC experience"],
  ["f339bcdb", "budget experience"],
  ["43e2b175", "team lead experience"],
  ["24ffdf6a", "other languages"],
  ["cf2afe9c", "other languages"],

  // Answers that are a word or two by design
  ["234f1199", "two words from supervisor"],
  ["e8ae0f95", "two words from supervisor"],
  ["8795b8c6", "two words from supervisor"],
  ["b2d8e11a", "two words from supervisor"],
  ["1da6385b", "two words from supervisor"],
  ["1c1a4330", "how they heard of us"],
  ["6eb5d689", "how they heard of us"],
  ["2cbce165", "involved in a protocol"],
  ["e83321fb", "involved in a protocol"],

  // Comfort and willingness checks
  ["539ef070", "barriers to personal care"],
  ["a3c72093", "comfortable at hospital"],
  ["2ea53481", "comfortable at hospital"],
  ["ffea5e67", "comfortable with a hold"],
  ["ca3d943d", "comfortable single staffed"],
  ["1389b9d6", "willing to cover other homes"],

  // Closing courtesies
  ["a9d25e17", "still interested"],
  ["9ee9a45f", "still interested"],
  ["feb1e512", "still interested"],
  ["47b9eceb", "still interested"],
  ["974bef94", "still interested"],
  ["bcbf7c26", "any questions for us"],
  ["1b9fcd3a", "any questions for us"],
  ["f4a8deb0", "any questions for us"],
  ["493d276d", "any questions for us"],
  ["610dbae6", "any questions for us"],
  ["0496b34d", "any questions for us"],
  ["662544df", "anything else to add"],
  ["8269ddce", "anything else to add"],

  // Lines addressed to the interviewer, not the candidate
  ["49522ce0", "interview preamble script"],
  ["001c678e", "interview preamble script"],
  ["22861f81", "brief the applicant"],
  ["063bea1b", "stray answer key text"],
  ["22c4a92d", "stray answer key text"],
];

let changed = 0;
const missed = [];
const byType = new Map();

for (const [prefix, reason] of EXEMPT) {
  const row = db
    .prepare(
      `SELECT q.id, q.text, q.min_notes, t.name tn
         FROM questions q JOIN interview_types t ON t.id = q.type_id
        WHERE q.id LIKE ?`,
    )
    .get(`${prefix}%`);

  if (!row) {
    missed.push([prefix, reason]);
    continue;
  }
  if (row.min_notes === 0) continue;

  db.prepare("UPDATE questions SET min_notes = 0 WHERE id = ?").run(row.id);
  changed += 1;
  const list = byType.get(row.tn) ?? [];
  list.push(`${reason}: ${row.text.replace(/\s+/g, " ").slice(0, 74)}`);
  byType.set(row.tn, list);
}

for (const [type, items] of byType) {
  console.log(`\n### ${type}`);
  for (const item of items) console.log("  - " + item);
}

if (missed.length > 0) {
  console.log("\nNOT FOUND:", missed.map(([p, r]) => `${p} (${r})`).join(", "));
}

// Mirror into the seed file so a fresh deployment matches.
const seedPath = "./server/src/data/interview-library.json";
const library = JSON.parse(readFileSync(seedPath, "utf8"));
let seedChanged = 0;

for (const type of library) {
  const row = db
    .prepare("SELECT id FROM interview_types WHERE name = ?")
    .get(type.name);
  if (!row) continue;
  const live = db
    .prepare("SELECT text, min_notes FROM questions WHERE type_id = ? ORDER BY sort")
    .all(row.id);
  type.questions.forEach((question, index) => {
    const match = live[index];
    if (match && question.minNotes !== match.min_notes) {
      question.minNotes = match.min_notes;
      seedChanged += 1;
    }
  });
}
writeFileSync(seedPath, JSON.stringify(library, null, 2) + "\n", "utf8");

const totals = db
  .prepare(
    "SELECT min_notes, COUNT(*) c FROM questions GROUP BY min_notes ORDER BY min_notes",
  )
  .all();
console.log(`\n${changed} questions exempted, ${seedChanged} updated in the seed file.`);
for (const t of totals) {
  console.log(`  ${String(t.c).padStart(3)} questions at min_notes = ${t.min_notes}`);
}
