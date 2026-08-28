/**
 * Integration tests against a real in-memory database.
 *
 * The environment comes from vitest.config.ts, not from this file: the server
 * reads its configuration when its modules load, and ESM evaluates imports
 * before any statement here could run.
 */
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { migrate } from "../db/index.js";
import { seedAll } from "../db/seed.js";

let app: FastifyInstance;
let adminCookie = "";

const silent = { info: () => undefined, warn: () => undefined };

beforeAll(async () => {
  migrate();
  app = await buildApp();
  await seedAll(silent);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "admin@milieu.test", password: "adminpassword123" },
  });
  adminCookie = login.headers["set-cookie"] as string;
});

afterAll(async () => {
  await app.close();
});

const auth = () => ({ cookie: adminCookie });

describe("authentication", () => {
  it("rejects a wrong password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@milieu.test", password: "wrong" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("gives the same answer for an unknown email as for a wrong password", async () => {
    const unknown = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@milieu.test", password: "wrong" },
    });
    const wrong = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@milieu.test", password: "wrong" },
    });
    expect(unknown.statusCode).toBe(wrong.statusCode);
    expect(unknown.json()["error"]).toBe(wrong.json()["error"]);
  });

  it("refuses anonymous access to the library", async () => {
    const response = await app.inject({ method: "GET", url: "/api/types" });
    expect(response.statusCode).toBe(401);
  });

  it("signs in the seeded admin", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: auth(),
    });
    expect(response.json()["user"].role).toBe("admin");
  });
});

describe("registration", () => {
  it("refuses an unknown access code", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Nope",
        email: "nope@milieu.test",
        password: "password12345",
        accessCode: "WRONG-CODE",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()["details"].accessCode).toBeTruthy();
  });

  it("accepts a valid code and creates a staff account", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Sam Staff",
        email: "sam@milieu.test",
        password: "password12345",
        accessCode: "TEST-CODE",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()["user"].role).toBe("staff");
  });

  it("refuses an email that is already registered", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Sam Again",
        email: "sam@milieu.test",
        password: "password12345",
        accessCode: "TEST-CODE",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()["details"].email).toBeTruthy();
  });

  it("refuses a code that has been switched off", async () => {
    const codes = await app.inject({
      method: "GET",
      url: "/api/admin/access-codes",
      headers: auth(),
    });
    const code = codes.json()["codes"][0];
    await app.inject({
      method: "POST",
      url: `/api/admin/access-codes/${code.id}/active`,
      headers: auth(),
      payload: { active: false },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Too Late",
        email: "late@milieu.test",
        password: "password12345",
        accessCode: code.code,
      },
    });
    expect(response.statusCode).toBe(400);

    await app.inject({
      method: "POST",
      url: `/api/admin/access-codes/${code.id}/active`,
      headers: auth(),
      payload: { active: true },
    });
  });
});

describe("the seeded library", () => {
  it("loads every interview type from Milieu's forms", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/types",
      headers: auth(),
    });
    const types = response.json()["types"];
    expect(types).toHaveLength(14);
    expect(types.every((t: { questions: unknown[] }) => t.questions.length > 0)).toBe(
      true,
    );
  });

  it("keeps the 70% thresholds from the internal forms", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/types",
      headers: auth(),
    });
    const youth = response
      .json()
      ["types"].find((t: { name: string }) => t.name === "Youth Internal");
    expect(youth.passThreshold).toBe(7);
  });

  it("carries answer keys through to the questions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/types",
      headers: auth(),
    });
    const keyed = response
      .json()
      ["types"].flatMap((t: { questions: { answerKey: string | null }[] }) =>
        t.questions.filter((q) => q.answerKey),
      );
    expect(keyed.length).toBeGreaterThan(40);
  });
});

describe("running an interview", () => {
  let interviewId = "";
  let questionId = "";

  it("starts from a type and freezes a snapshot of it", async () => {
    const types = await app.inject({
      method: "GET",
      url: "/api/types",
      headers: auth(),
    });
    const type = types.json()["types"][0];

    const started = await app.inject({
      method: "POST",
      url: "/api/interviews",
      headers: auth(),
      payload: {
        typeId: type.id,
        candidateName: "Jordan Rivera",
        position: "Youth Support Worker",
        interviewerNames: "A. Patel",
      },
    });
    expect(started.statusCode).toBe(200);

    const interview = started.json()["interview"];
    interviewId = interview.id;
    questionId = interview.snapshot.questions[0].id;
    expect(interview.status).toBe("draft");
    expect(interview.snapshot.questions).toHaveLength(type.questions.length);
  });

  it("keeps the snapshot when the type is edited afterwards", async () => {
    const before = await app.inject({
      method: "GET",
      url: `/api/interviews/${interviewId}`,
      headers: auth(),
    });
    const typeId = before.json()["interview"].typeId;
    const originalCount = before.json()["interview"].snapshot.questions.length;

    await app.inject({
      method: "PUT",
      url: `/api/types/${typeId}`,
      headers: auth(),
      payload: {
        name: "Renamed after the interview",
        description: null,
        passThreshold: 9.9,
        questions: [
          { text: "A single replacement question", answerKey: null, inputKind: "text", inputConfig: {} },
        ],
      },
    });

    const after = await app.inject({
      method: "GET",
      url: `/api/interviews/${interviewId}`,
      headers: auth(),
    });
    const snapshot = after.json()["interview"].snapshot;
    expect(snapshot.questions).toHaveLength(originalCount);
    expect(snapshot.passThreshold).not.toBe(9.9);
  });

  it("saves a draft and reads it back", async () => {
    const saved = await app.inject({
      method: "PUT",
      url: `/api/interviews/${interviewId}/draft`,
      headers: auth(),
      payload: {
        responses: [
          {
            questionId,
            notes: "Answered clearly, gave an example.",
            inputValue: true,
            interviewerRating: 4,
            redFlag: true,
            redFlagNote: "Check this with the reference",
            secondsSpent: 75,
          },
        ],
        durationSeconds: 75,
      },
    });
    expect(saved.statusCode).toBe(200);

    const read = await app.inject({
      method: "GET",
      url: `/api/interviews/${interviewId}`,
      headers: auth(),
    });
    const response = read.json()["interview"].responses[0];
    expect(response.notes).toContain("gave an example");
    expect(response.interviewerRating).toBe(4);
    expect(response.redFlag).toBe(true);
  });

  it("replaces the response set on each save rather than accumulating", async () => {
    await app.inject({
      method: "PUT",
      url: `/api/interviews/${interviewId}/draft`,
      headers: auth(),
      payload: {
        responses: [
          {
            questionId,
            notes: "Revised note",
            inputValue: null,
            interviewerRating: null,
            redFlag: false,
            redFlagNote: null,
            secondsSpent: 90,
          },
        ],
        durationSeconds: 90,
      },
    });
    const read = await app.inject({
      method: "GET",
      url: `/api/interviews/${interviewId}`,
      headers: auth(),
    });
    expect(read.json()["interview"].responses).toHaveLength(1);
    expect(read.json()["interview"].responses[0].notes).toBe("Revised note");
  });

  it("refuses a score before there is an evaluation to score against", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/interviews/${interviewId}/score`,
      headers: auth(),
      payload: { finalScore: 8 },
    });
    expect(response.statusCode).toBe(400);
  });

  it("reports a CSV of every interview", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/interviews.csv",
      headers: auth(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Candidate,Position");
    expect(response.body).toContain("Jordan Rivera");
  });
});

describe("admin access", () => {
  let staffCookie = "";

  beforeAll(async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "sam@milieu.test", password: "password12345" },
    });
    staffCookie = login.headers["set-cookie"] as string;
  });

  it("keeps staff out of the admin endpoints", async () => {
    for (const url of [
      "/api/admin/users",
      "/api/admin/access-codes",
      "/api/admin/settings",
      "/api/admin/audit",
      "/api/admin/usage",
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: { cookie: staffCookie },
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it("lets staff use the interview endpoints", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/types",
      headers: { cookie: staffCookie },
    });
    expect(response.statusCode).toBe(200);
  });

  it("refuses to demote the only admin", async () => {
    const users = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: auth(),
    });
    const admin = users
      .json()
      ["users"].find((u: { role: string }) => u.role === "admin");

    const response = await app.inject({
      method: "PUT",
      url: `/api/admin/users/${admin.id}/role`,
      headers: auth(),
      payload: { role: "staff" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("records what happened in the audit log", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: auth(),
    });
    const actions = response
      .json()
      ["entries"].map((e: { action: string }) => e.action);
    expect(actions).toContain("start");
    expect(actions).toContain("register");
  });
});

describe("AI endpoints without a key", () => {
  it("answers with a clear message rather than failing opaquely", async () => {
    const interviews = await app.inject({
      method: "GET",
      url: "/api/interviews",
      headers: auth(),
    });
    const interview = interviews.json()["interviews"][0];
    const question = await app.inject({
      method: "GET",
      url: `/api/interviews/${interview.id}`,
      headers: auth(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/interviews/${interview.id}/suggest`,
      headers: auth(),
      payload: {
        interviewId: interview.id,
        questionId: question.json()["interview"].snapshot.questions[0].id,
        notes: "Some notes worth following up on.",
      },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()["error"]).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("reports which optional features are switched off", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/capabilities",
      headers: auth(),
    });
    expect(response.json()).toEqual({ ai: false, email: false });
  });
});
