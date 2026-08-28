import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { InputConfig, Question } from "@milieu/shared";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";
import type { InterviewDetail, InterviewResponse } from "../lib/types";
import {
  clearLocalDraft,
  localDraftIsNewer,
  readLocalDraft,
  writeLocalDraft,
} from "../lib/draft";
import { Alert, BrandRule, Modal } from "../components/ui";

/**
 * Live follow-up suggestions cost money per call, so they are gated hard:
 * the interviewer has to have stopped typing, written a meaningful amount
 * since the last call, and left enough time since the last one.
 */
const SUGGEST_IDLE_MS = 5000;
const SUGGEST_MIN_NEW_CHARS = 80;
const SUGGEST_COOLDOWN_MS = 20000;

const AUTOSAVE_MS = 4000;

function emptyResponse(questionId: string): InterviewResponse {
  return {
    questionId,
    notes: "",
    inputValue: null,
    interviewerRating: null,
    redFlag: false,
    redFlagNote: null,
    secondsSpent: 0,
  };
}

function elapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The extra control shown above the notes box, chosen per question. */
function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const config: InputConfig = question.inputConfig ?? {};

  if (question.inputKind === "yes_no") {
    return (
      <div className="choice-row">
        {[
          { label: "Yes", value: true },
          { label: "No", value: false },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            className="choice"
            aria-pressed={value === option.value}
            onClick={() =>
              onChange(value === option.value ? null : option.value)
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  if (question.inputKind === "scale") {
    const min = config.min ?? 1;
    const max = config.max ?? 5;
    const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return (
      <div className="choice-row">
        {config.minLabel ? (
          <span className="subtle" style={{ alignSelf: "center" }}>
            {config.minLabel}
          </span>
        ) : null}
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className="choice"
            aria-pressed={value === option}
            onClick={() => onChange(value === option ? null : option)}
          >
            {option}
          </button>
        ))}
        {config.maxLabel ? (
          <span className="subtle" style={{ alignSelf: "center" }}>
            {config.maxLabel}
          </span>
        ) : null}
      </div>
    );
  }

  if (question.inputKind === "checkbox_list") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="choice-row">
        {(config.options ?? []).map((option) => (
          <button
            key={option}
            type="button"
            className="choice"
            aria-pressed={selected.includes(option)}
            onClick={() =>
              onChange(
                selected.includes(option)
                  ? selected.filter((s) => s !== option)
                  : [...selected, option],
              )
            }
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  if (question.inputKind === "number") {
    return (
      <div className="choice-row">
        <input
          className="input"
          style={{ maxWidth: 180 }}
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
        />
        {config.unit ? (
          <span className="subtle" style={{ alignSelf: "center" }}>
            {config.unit}
          </span>
        ) : null}
      </div>
    );
  }

  return null;
}

export function InterviewSession() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { capabilities } = useSession();

  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [responses, setResponses] = useState<Map<string, InterviewResponse>>(
    new Map(),
  );
  const [index, setIndex] = useState(0);
  const [showKey, setShowKey] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline">(
    "saved",
  );
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [flagPrompt, setFlagPrompt] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);

  const dirty = useRef(false);
  const lastSuggestAt = useRef(0);
  const lastSuggestChars = useRef(0);
  const suggestTimer = useRef<number | null>(null);

  const questions = interview?.snapshot.questions ?? [];
  const question = questions[index];

  // --- Load, preferring a local draft the server has not seen ---

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.get<{ interview: InterviewDetail }>(
          `/api/interviews/${id}`,
        );
        if (cancelled) return;

        if (result.interview.status === "completed") {
          navigate(`/interview/${id}/review`, { replace: true });
          return;
        }

        const local = readLocalDraft(id);
        const useLocal = localDraftIsNewer(local, result.interview.responses);
        const source = useLocal && local ? local.responses : result.interview.responses;

        setInterview(result.interview);
        setResponses(new Map(source.map((r) => [r.questionId, r])));
        setSeconds(
          Math.max(
            result.interview.durationSeconds,
            useLocal && local ? local.durationSeconds : 0,
          ),
        );
        if (useLocal) {
          setRecovered(true);
          dirty.current = true;
        }
      } catch {
        if (!cancelled) setError("This interview could not be opened.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  // --- Timer ---

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const responseList = useMemo(
    () => questions.map((q) => responses.get(q.id) ?? emptyResponse(q.id)),
    [questions, responses],
  );

  // --- Saving ---

  const save = useCallback(async () => {
    if (!dirty.current || !interview) return;
    const payload = { responses: responseList, durationSeconds: seconds };

    // Written locally first, so a failed request still leaves the notes safe.
    writeLocalDraft(id, { ...payload, savedAt: new Date().toISOString() });
    setSaveState("saving");
    try {
      await api.put(`/api/interviews/${id}/draft`, payload);
      dirty.current = false;
      setSaveState("saved");
      clearLocalDraft(id);
      setRecovered(false);
    } catch {
      setSaveState("offline");
    }
  }, [id, interview, responseList, seconds]);

  useEffect(() => {
    const timer = window.setInterval(() => void save(), AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [save]);

  // A reload mid-interview must not lose the last few keystrokes.
  useEffect(() => {
    const onLeave = () => {
      if (dirty.current) {
        writeLocalDraft(id, {
          responses: responseList,
          durationSeconds: seconds,
          savedAt: new Date().toISOString(),
        });
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      onLeave();
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [id, responseList, seconds]);

  const update = useCallback(
    (questionId: string, patch: Partial<InterviewResponse>) => {
      setResponses((current) => {
        const next = new Map(current);
        next.set(questionId, {
          ...(next.get(questionId) ?? emptyResponse(questionId)),
          ...patch,
        });
        return next;
      });
      dirty.current = true;
    },
    [],
  );

  // --- Live follow-up suggestion ---

  const requestSuggestion = useCallback(
    async (target: Question, notes: string) => {
      if (!capabilities.ai) return;
      const now = Date.now();
      if (now - lastSuggestAt.current < SUGGEST_COOLDOWN_MS) return;
      if (notes.length - lastSuggestChars.current < SUGGEST_MIN_NEW_CHARS) return;

      lastSuggestAt.current = now;
      lastSuggestChars.current = notes.length;
      try {
        const result = await api.post<{ suggestion: string | null }>(
          `/api/interviews/${id}/suggest`,
          { interviewId: id, questionId: target.id, notes },
        );
        // Silence is the normal answer, so nothing is shown unless there is
        // something worth saying.
        if (result.suggestion) setSuggestion(result.suggestion);
      } catch {
        // A missed suggestion is not worth telling the interviewer about.
      }
    },
    [capabilities.ai, id],
  );

  const onNotesChange = useCallback(
    (target: Question, notes: string) => {
      update(target.id, { notes });
      if (suggestTimer.current) window.clearTimeout(suggestTimer.current);
      suggestTimer.current = window.setTimeout(() => {
        void requestSuggestion(target, notes);
      }, SUGGEST_IDLE_MS);
    },
    [requestSuggestion, update],
  );

  // Moving on clears the previous question's suggestion and its counters.
  useEffect(() => {
    setSuggestion(null);
    setShowKey(false);
    lastSuggestChars.current = 0;
    lastSuggestAt.current = 0;
    if (suggestTimer.current) window.clearTimeout(suggestTimer.current);
  }, [index]);

  // --- Keyboard navigation ---

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.altKey || event.metaKey)) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setIndex((i) => Math.min(i + 1, questions.length - 1));
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [questions.length]);

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      const result = await api.post<{
        interview: InterviewDetail;
        failures: string[];
      }>(`/api/interviews/${id}/complete`, {
        responses: responseList,
        durationSeconds: seconds,
      });
      dirty.current = false;
      clearLocalDraft(id);
      navigate(`/interview/${id}/review`, {
        state: { failures: result.failures },
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The interview could not be completed. Your notes are saved.",
      );
      setFinishing(false);
    }
  }

  if (error && !interview) return <Alert>{error}</Alert>;
  if (!interview || !question) return <p className="muted">Loading</p>;

  const current = responses.get(question.id) ?? emptyResponse(question.id);
  const answered = responseList.filter((r) => r.notes.trim()).length;
  const next = questions[index + 1];

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{interview.candidateName}</h1>
          <BrandRule />
          <div className="subtle" style={{ marginTop: 8 }}>
            {interview.snapshot.name}
            {interview.position ? ` · ${interview.position}` : ""}
          </div>
        </div>
        <div className="row">
          <span className="save-state num">{elapsed(seconds)}</span>
          <span
            className={`save-state ${saveState === "offline" ? "save-state--offline" : ""}`}
          >
            {saveState === "saving"
              ? "Saving"
              : saveState === "offline"
                ? "Saved on this device only"
                : "Saved"}
          </span>
        </div>
      </div>

      {recovered ? (
        <div className="banner" style={{ marginBottom: 14 }}>
          Notes were recovered from this device. They will sync once saving
          succeeds.
        </div>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}

      <div className="session">
        <div>
          <div className="question-card">
            <div className="question-number">
              Question {index + 1} of {questions.length}
            </div>
            <div className="question-text">{question.text}</div>

            {question.answerKey ? (
              <>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  style={{ padding: 0, marginBottom: 10 }}
                  onClick={() => setShowKey((s) => !s)}
                >
                  {showKey ? "Hide answer key" : "Show answer key"}
                </button>
                {showKey ? (
                  <div className="answer-key">{question.answerKey}</div>
                ) : null}
              </>
            ) : null}

            <QuestionInput
              question={question}
              value={current.inputValue}
              onChange={(value) => update(question.id, { inputValue: value })}
            />

            <textarea
              className="textarea"
              value={current.notes}
              placeholder="Notes from their answer"
              onChange={(e) => onNotesChange(question, e.target.value)}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />

            {suggestion ? (
              <div className="suggestion">
                <div style={{ flex: 1 }}>
                  <div className="label">Possible follow-up</div>
                  {suggestion}
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setSuggestion(null)}
                  aria-label="Dismiss suggestion"
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            <div className="row-between" style={{ marginTop: 16 }}>
              <div className="row">
                <span className="subtle">Your rating</span>
                <div className="rating">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="choice"
                      aria-pressed={current.interviewerRating === value}
                      aria-label={`Rate ${value} of 5`}
                      onClick={() =>
                        update(question.id, {
                          interviewerRating:
                            current.interviewerRating === value ? null : value,
                        })
                      }
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className={
                  current.redFlag
                    ? "btn btn--destructive btn--sm"
                    : "btn btn--ghost btn--sm"
                }
                onClick={() => {
                  if (current.redFlag) {
                    update(question.id, { redFlag: false, redFlagNote: null });
                  } else {
                    setFlagNote("");
                    setFlagPrompt(question.id);
                  }
                }}
              >
                {current.redFlag ? "Flagged" : "Flag this answer"}
              </button>
            </div>
          </div>

          <div className="row-between" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index === 0}
            >
              Previous
            </button>
            {index < questions.length - 1 ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setIndex((i) => i + 1)}
              >
                Next question
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void finish()}
                disabled={finishing}
              >
                {finishing ? "Processing" : "Finish interview"}
              </button>
            )}
          </div>
        </div>

        <aside className="session-side">
          <div className="card">
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="subtle">Progress</span>
              <span className="subtle num">
                {answered}/{questions.length}
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${(answered / Math.max(questions.length, 1)) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="card">
            <div className="subtle" style={{ marginBottom: 8 }}>
              Questions
            </div>
            <div className="jump-list">
              {questions.map((q, i) => {
                const response = responses.get(q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    className="jump-item"
                    aria-current={i === index}
                    onClick={() => setIndex(i)}
                  >
                    <span className="jump-index">{i + 1}</span>
                    <span
                      className={`jump-dot ${
                        response?.redFlag
                          ? "jump-dot--flagged"
                          : response?.notes.trim()
                            ? "jump-dot--answered"
                            : ""
                      }`}
                    />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {q.text}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => void finish()}
            disabled={finishing}
          >
            {finishing ? "Processing" : "Finish interview"}
          </button>
        </aside>
      </div>

      {next ? (
        <div className="next-preview" aria-hidden="true">
          <div className="label">Up next</div>
          {next.text}
        </div>
      ) : null}

      {flagPrompt ? (
        <Modal
          title="Flag this answer"
          onClose={() => setFlagPrompt(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setFlagPrompt(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => {
                  update(flagPrompt, {
                    redFlag: true,
                    redFlagNote: flagNote.trim() || null,
                  });
                  setFlagPrompt(null);
                }}
              >
                Flag it
              </button>
            </>
          }
        >
          <p className="muted">
            Flagged answers are called out in the evaluation report.
          </p>
          <textarea
            className="textarea"
            style={{ minHeight: 90 }}
            placeholder="What concerned you? Optional."
            value={flagNote}
            onChange={(e) => setFlagNote(e.target.value)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
