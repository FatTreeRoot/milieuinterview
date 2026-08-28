import type { InputConfig, InputKind, InterviewType, Question } from "@milieu/shared";
import { all, get, parseJson, run, toBool, transaction } from "../db/index.js";
import { id, now } from "./ids.js";
import { notFound } from "./http.js";

function toQuestion(row: Record<string, unknown>): Question {
  return {
    id: row["id"] as string,
    sort: row["sort"] as number,
    text: row["text"] as string,
    answerKey: (row["answer_key"] as string | null) ?? null,
    inputKind: row["input_kind"] as InputKind,
    inputConfig: parseJson<InputConfig>(row["input_config"], {}),
  };
}

export function listTypes(includeArchived: boolean): InterviewType[] {
  const rows = all(
    `SELECT * FROM interview_types
      ${includeArchived ? "" : "WHERE archived = 0"}
      ORDER BY sort, name`,
  );
  return rows.map((row) => ({
    id: row["id"] as string,
    name: row["name"] as string,
    description: (row["description"] as string | null) ?? null,
    passThreshold: row["pass_threshold"] as number,
    archived: toBool(row["archived"]),
    sort: row["sort"] as number,
    questions: all(
      "SELECT * FROM questions WHERE type_id = ? ORDER BY sort",
      row["id"],
    ).map(toQuestion),
  }));
}

export function getType(typeId: string): InterviewType {
  const row = get("SELECT * FROM interview_types WHERE id = ?", typeId);
  if (!row) throw notFound("That interview type no longer exists");
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    description: (row["description"] as string | null) ?? null,
    passThreshold: row["pass_threshold"] as number,
    archived: toBool(row["archived"]),
    sort: row["sort"] as number,
    questions: all(
      "SELECT * FROM questions WHERE type_id = ? ORDER BY sort",
      typeId,
    ).map(toQuestion),
  };
}

export type TypeInput = {
  name: string;
  description: string | null;
  passThreshold: number;
  questions: {
    id?: string | undefined;
    text: string;
    answerKey: string | null;
    inputKind: InputKind;
    inputConfig: InputConfig;
  }[];
};

export function createType(input: TypeInput): string {
  const typeId = id();
  const nextSort = get("SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM interview_types");
  transaction(() => {
    run(
      `INSERT INTO interview_types
         (id, name, description, pass_threshold, sort, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      typeId,
      input.name,
      input.description,
      input.passThreshold,
      (nextSort?.["s"] as number) ?? 0,
      now(),
      now(),
    );
    writeQuestions(typeId, input.questions);
  });
  return typeId;
}

/**
 * Replaces the question list wholesale. Questions carrying an id keep it, so
 * an edit does not orphan the responses of an in-progress draft that
 * references them.
 */
function writeQuestions(typeId: string, questions: TypeInput["questions"]): void {
  run("DELETE FROM questions WHERE type_id = ?", typeId);
  questions.forEach((question, index) => {
    run(
      `INSERT INTO questions
         (id, type_id, sort, text, answer_key, input_kind, input_config)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      question.id ?? id(),
      typeId,
      index,
      question.text,
      question.answerKey,
      question.inputKind,
      JSON.stringify(question.inputConfig ?? {}),
    );
  });
}

export function updateType(typeId: string, input: TypeInput): void {
  getType(typeId);
  transaction(() => {
    run(
      `UPDATE interview_types
          SET name = ?, description = ?, pass_threshold = ?, updated_at = ?
        WHERE id = ?`,
      input.name,
      input.description,
      input.passThreshold,
      now(),
      typeId,
    );
    writeQuestions(typeId, input.questions);
  });
}

export function setArchived(typeId: string, archived: boolean): void {
  getType(typeId);
  run(
    "UPDATE interview_types SET archived = ?, updated_at = ? WHERE id = ?",
    archived ? 1 : 0,
    now(),
    typeId,
  );
}

export function deleteType(typeId: string): void {
  getType(typeId);
  run("DELETE FROM interview_types WHERE id = ?", typeId);
}

export function duplicateType(typeId: string): string {
  const source = getType(typeId);
  return createType({
    name: `${source.name} (copy)`,
    description: source.description,
    passThreshold: source.passThreshold,
    questions: source.questions.map((q) => ({
      text: q.text,
      answerKey: q.answerKey,
      inputKind: q.inputKind,
      inputConfig: q.inputConfig,
    })),
  });
}

export function reorderTypes(orderedIds: string[]): void {
  transaction(() => {
    orderedIds.forEach((typeId, index) => {
      run("UPDATE interview_types SET sort = ? WHERE id = ?", index, typeId);
    });
  });
}
