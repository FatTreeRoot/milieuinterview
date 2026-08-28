/**
 * Schema migrations, applied in order at boot.
 *
 * Each entry runs once and is recorded in `schema_migrations`. Never edit a
 * migration that has shipped: add another one.
 */

export type Migration = { name: string; sql: string };

export const migrations: Migration[] = [
  {
    name: "0001_initial",
    sql: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        name          TEXT NOT NULL,
        role          TEXT NOT NULL CHECK (role IN ('admin','staff')),
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL
      );

      CREATE TABLE auth_sessions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);

      CREATE TABLE access_codes (
        id         TEXT PRIMARY KEY,
        code       TEXT NOT NULL UNIQUE,
        label      TEXT NOT NULL,
        active     INTEGER NOT NULL DEFAULT 1,
        uses       INTEGER NOT NULL DEFAULT 0,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE interview_types (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        description    TEXT,
        pass_threshold REAL NOT NULL DEFAULT 7.5,
        sort           INTEGER NOT NULL DEFAULT 0,
        archived       INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      CREATE TABLE questions (
        id           TEXT PRIMARY KEY,
        type_id      TEXT NOT NULL REFERENCES interview_types(id) ON DELETE CASCADE,
        sort         INTEGER NOT NULL,
        text         TEXT NOT NULL,
        answer_key   TEXT,
        input_kind   TEXT NOT NULL DEFAULT 'text'
                     CHECK (input_kind IN ('text','yes_no','scale','checkbox_list','number')),
        input_config TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX idx_questions_type ON questions(type_id, sort);

      CREATE TABLE interviews (
        id               TEXT PRIMARY KEY,
        type_id          TEXT REFERENCES interview_types(id) ON DELETE SET NULL,
        -- Questions and keys frozen at start, so later library edits never
        -- change what a past interview says was asked.
        type_snapshot    TEXT NOT NULL,
        candidate_name   TEXT NOT NULL,
        position         TEXT,
        interviewer_names TEXT,
        created_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
        status           TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','completed')),
        started_at       TEXT NOT NULL,
        completed_at     TEXT,
        duration_seconds INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_interviews_status ON interviews(status, started_at DESC);

      CREATE TABLE responses (
        id                 TEXT PRIMARY KEY,
        interview_id       TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
        question_id        TEXT NOT NULL,
        notes              TEXT NOT NULL DEFAULT '',
        input_value        TEXT,
        interviewer_rating INTEGER CHECK (interviewer_rating BETWEEN 1 AND 5),
        red_flag           INTEGER NOT NULL DEFAULT 0,
        red_flag_note      TEXT,
        seconds_spent      INTEGER NOT NULL DEFAULT 0,
        UNIQUE (interview_id, question_id)
      );

      CREATE TABLE documents (
        id           TEXT PRIMARY KEY,
        interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
        kind         TEXT NOT NULL CHECK (kind IN ('cleaned','report')),
        content      TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        UNIQUE (interview_id, kind)
      );

      CREATE TABLE evaluations (
        id           TEXT PRIMARY KEY,
        interview_id TEXT NOT NULL UNIQUE REFERENCES interviews(id) ON DELETE CASCADE,
        ai_score     REAL NOT NULL,
        -- The interviewer's own score. When set it wins over ai_score
        -- everywhere an outcome or statistic is shown.
        final_score  REAL,
        threshold    REAL NOT NULL,
        report       TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE ai_usage (
        id                TEXT PRIMARY KEY,
        interview_id      TEXT REFERENCES interviews(id) ON DELETE SET NULL,
        feature           TEXT NOT NULL,
        model             TEXT NOT NULL,
        input_tokens      INTEGER NOT NULL DEFAULT 0,
        output_tokens     INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd          REAL NOT NULL DEFAULT 0,
        created_at        TEXT NOT NULL
      );
      CREATE INDEX idx_ai_usage_created ON ai_usage(created_at);

      CREATE TABLE audit_log (
        id         TEXT PRIMARY KEY,
        user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
        action     TEXT NOT NULL,
        entity     TEXT NOT NULL,
        entity_id  TEXT,
        detail     TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    name: "0002_question_min_notes",
    sql: `
      -- How many characters the interviewer must write before moving on.
      -- Simple intake questions are exempt: a licence check has nothing more
      -- to say, and demanding a paragraph would only invite padding.
      ALTER TABLE questions
        ADD COLUMN min_notes INTEGER NOT NULL DEFAULT 120;

      UPDATE questions SET min_notes = 0 WHERE input_kind = 'yes_no';
    `,
  },
];
