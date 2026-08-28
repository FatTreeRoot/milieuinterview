import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { formatScore } from "@milieu/shared";
import { api, ApiError } from "../lib/api";
import type { InterviewDetail, InterviewType } from "../lib/types";
import { Alert, Empty, Field, PageHead } from "../components/ui";

export function StartInterview() {
  const [types, setTypes] = useState<InterviewType[]>([]);
  const [typeId, setTypeId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [position, setPosition] = useState("");
  // Interviews here are usually run by a panel, so this is a list from the
  // start. It is stored as one string so exports and past records stay
  // readable without a migration.
  const [interviewers, setInterviewers] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void api
      .get<{ types: InterviewType[] }>("/api/types")
      .then((r) => setTypes(r.types))
      .catch(() => setError("The interview library could not be loaded."));
  }, []);

  const selected = types.find((t) => t.id === typeId) ?? null;

  function setInterviewer(index: number, value: string) {
    setInterviewers((current) =>
      current.map((name, i) => (i === index ? value : name)),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const named = interviewers.map((n) => n.trim()).filter(Boolean);
      const result = await api.post<{ interview: InterviewDetail }>(
        "/api/interviews",
        {
          typeId,
          candidateName,
          position: position.trim() || null,
          interviewerNames: named.length > 0 ? named.join(", ") : null,
        },
      );
      navigate(`/interview/${result.interview.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The interview could not be started.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="page-centred">
      <PageHead
        title="Start an Interview"
        lede="Choose the interview type, then note who you are meeting."
      />

      {error ? <Alert>{error}</Alert> : null}

      {types.length === 0 && !error ? (
        <div className="card">
          <Empty>
            There are no interview types yet. Add one in the interview library
            first.
          </Empty>
        </div>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <Field label="Interview Type">
            <select
              className="select"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              required
            >
              <option value="">Choose one</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </Field>

          {selected ? (
            <div className="note">
              {selected.description ? <>{selected.description} </> : null}
              {selected.questions.length} question
              {selected.questions.length === 1 ? "" : "s"}. Pass threshold{" "}
              {formatScore(selected.passThreshold)} out of 10.
            </div>
          ) : null}

          <Field label="Candidate Name">
            <input
              className="input"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              required
            />
          </Field>

          <Field label="Position" hint="Optional. The posting they applied for.">
            <input
              className="input"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </Field>

          <div className="field">
            <label>Interviewers</label>
            <div className="stack" style={{ gap: 8 }}>
              {interviewers.map((name, index) => (
                <div key={index} className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                  <input
                    className="input"
                    value={name}
                    placeholder={
                      index === 0 ? "Name" : `Interviewer ${index + 1}`
                    }
                    onChange={(e) => setInterviewer(index, e.target.value)}
                  />
                  {interviewers.length > 1 ? (
                    <button
                      type="button"
                      className="btn btn--ghost icon-btn"
                      aria-label={`Remove interviewer ${index + 1}`}
                      title="Remove"
                      onClick={() =>
                        setInterviewers((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setInterviewers((current) => [...current, ""])}
                style={{ marginTop: 8 }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add Interviewer
              </button>
            </div>
            <span className="hint">
              Optional. Everyone on the panel, for the record.
            </span>
          </div>

          <button
            className="btn btn--primary"
            type="submit"
            disabled={busy || !typeId}
          >
            {busy ? "Starting" : "Begin Interview"}
          </button>
        </form>
      )}
    </div>
  );
}
