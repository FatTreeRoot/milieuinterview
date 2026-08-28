import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { formatScore, normalizeScore } from "@milieu/shared";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";
import type { InterviewDetail } from "../lib/types";
import { Markdown } from "../components/Markdown";
import {
  Alert,
  BrandRule,
  Empty,
  Field,
  Modal,
  OutcomeBadge,
  formatDate,
  formatDuration,
} from "../components/ui";

type Tab = "cleaned" | "report";

export function InterviewReview() {
  const { id = "" } = useParams();
  const location = useLocation();
  const { capabilities } = useSession();

  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [tab, setTab] = useState<Tab>("cleaned");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [scoreInput, setScoreInput] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Passed through from the session when a post-processing pass failed.
  const failures = (location.state as { failures?: string[] } | null)?.failures ?? [];

  async function load() {
    try {
      const result = await api.get<{ interview: InterviewDetail }>(
        `/api/interviews/${id}`,
      );
      setInterview(result.interview);
      setScoreInput(
        result.interview.finalScore === null
          ? ""
          : String(result.interview.finalScore),
      );
    } catch {
      setError("This interview could not be loaded.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <Alert>{error}</Alert>;
  if (!interview) return <p className="muted">Loading</p>;

  const document = interview.documents.find((d) => d.kind === tab);

  async function saveDocument() {
    try {
      await api.put(`/api/interviews/${id}/documents/${tab}`, {
        content: draft,
      });
      setEditing(false);
      setNotice("Document saved.");
      await load();
    } catch {
      setError("The document could not be saved.");
    }
  }

  async function saveScore(value: string) {
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0 || parsed > 10)) {
      setError("Enter a score between 0.0 and 10.0.");
      return;
    }
    try {
      await api.put(`/api/interviews/${id}/score`, {
        finalScore: parsed === null ? null : normalizeScore(parsed),
      });
      setError(null);
      setNotice(
        parsed === null
          ? "Your score was cleared. The AI score is used again."
          : "Your score was saved and is now used everywhere.",
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "The score could not be saved.",
      );
    }
  }

  async function sendEmail() {
    setEmailBusy(true);
    try {
      await api.post(`/api/interviews/${id}/email`, {
        to: emailTo,
        includeInterview: true,
        includeReport: interview?.report !== null,
        message: emailMessage.trim() || null,
      });
      setEmailOpen(false);
      setNotice(`Sent to ${emailTo}.`);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "The email could not be sent.",
      );
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <div className="page-width">
      <div className="row-between" style={{ marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 24 }}>{interview.candidateName}</h1>
          <BrandRule />
          <div className="subtle" style={{ marginTop: 8 }}>
            {interview.snapshot.name}
            {interview.position ? ` · ${interview.position}` : ""} ·{" "}
            {formatDate(interview.startedAt)}
            {interview.durationSeconds
              ? ` · ${formatDuration(interview.durationSeconds)}`
              : ""}
          </div>
        </div>
        <OutcomeBadge
          passed={interview.passed}
          borderline={interview.borderline}
          score={interview.score}
        />
      </div>

      {failures.length > 0 ? (
        <div className="banner" style={{ marginBottom: 14 }}>
          {failures.includes("cleanup") && failures.includes("evaluation")
            ? "Both AI passes failed. Your notes are saved and the raw record is below."
            : failures.includes("cleanup")
              ? "The cleanup pass failed, so the document below holds the raw notes. The evaluation completed."
              : "The evaluation failed, so there is no report yet. The interview document completed."}
        </div>
      ) : null}
      {notice ? <div className="note" style={{ marginBottom: 14 }}>{notice}</div> : null}
      {error ? <Alert>{error}</Alert> : null}

      {/* Scoring. The interviewer's number wins wherever an outcome is shown. */}
      {interview.aiScore !== null ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="grid-3">
            <div>
              <div className="subtle">AI Score</div>
              <div className="score" style={{ fontSize: 22 }}>
                {formatScore(interview.aiScore)}
              </div>
            </div>
            <div>
              <div className="subtle">Pass Threshold</div>
              <div className="score" style={{ fontSize: 22 }}>
                {interview.threshold === null
                  ? "-"
                  : formatScore(interview.threshold)}
              </div>
            </div>
            <Field
              label="Your Score"
              hint="Optional. Used instead of the AI score in reporting."
            >
              <div className="row">
                <input
                  className="input"
                  style={{ maxWidth: 110 }}
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => void saveScore(scoreInput)}
                >
                  Save
                </button>
                {interview.finalScore !== null ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setScoreInput("");
                      void saveScore("");
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </Field>
          </div>
          {interview.finalScore !== null ? (
            <div className="note" style={{ marginTop: 14 }}>
              Your score of {formatScore(interview.finalScore)} is being used in
              place of the AI score of {formatScore(interview.aiScore)}.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="row-between" style={{ marginBottom: 12 }}>
        <div className="row">
          <button
            type="button"
            className={tab === "cleaned" ? "btn btn--primary btn--sm" : "btn btn--secondary btn--sm"}
            onClick={() => {
              setTab("cleaned");
              setEditing(false);
            }}
          >
            Interview Document
          </button>
          <button
            type="button"
            className={tab === "report" ? "btn btn--primary btn--sm" : "btn btn--secondary btn--sm"}
            onClick={() => {
              setTab("report");
              setEditing(false);
            }}
          >
            Evaluation Report
          </button>
        </div>

        <div className="row">
          {document ? (
            <>
              {editing ? (
                <>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => void saveDocument()}
                  >
                    Save Changes
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => {
                    setDraft(document.content);
                    setEditing(true);
                  }}
                >
                  Edit
                </button>
              )}
              <a
                className="btn btn--secondary btn--sm"
                href={`/api/interviews/${id}/documents/${tab}.pdf`}
              >
                Download PDF
              </a>
              {capabilities.email ? (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setEmailOpen(true)}
                >
                  Email
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="card">
        {!document ? (
          <Empty>
            {tab === "cleaned"
              ? "There is no interview document for this interview."
              : "There is no evaluation report for this interview."}
          </Empty>
        ) : editing ? (
          <textarea
            className="doc-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <Markdown source={document.content} />
        )}
      </div>

      <div className="row" style={{ marginTop: 18 }}>
        <Link className="btn btn--secondary btn--sm" to="/history">
          Back to Interview History
        </Link>
        <Link className="btn btn--ghost btn--sm" to="/">
          Home
        </Link>
      </div>

      {emailOpen ? (
        <Modal
          title="Email These Documents"
          onClose={() => setEmailOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setEmailOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => void sendEmail()}
                disabled={emailBusy || !emailTo}
              >
                {emailBusy ? "Sending" : "Send"}
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="banner">
              This sends candidate information outside the app. The send is
              recorded in the audit log.
            </div>
            <Field label="Send To">
              <input
                className="input"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
            </Field>
            <Field label="Message" hint="Optional.">
              <textarea
                className="textarea"
                style={{ minHeight: 90 }}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
              />
            </Field>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
