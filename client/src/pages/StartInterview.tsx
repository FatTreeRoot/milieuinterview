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
  const [interviewerNames, setInterviewerNames] = useState("");
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ interview: InterviewDetail }>(
        "/api/interviews",
        {
          typeId,
          candidateName,
          position: position.trim() || null,
          interviewerNames: interviewerNames.trim() || null,
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
    <div className="page-width" style={{ maxWidth: 720 }}>
      <PageHead
        title="Start an interview"
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
          <Field label="Interview type">
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

          <Field label="Candidate name">
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

          <Field
            label="Interviewers"
            hint="Optional. Everyone in the room, for the record."
          >
            <input
              className="input"
              value={interviewerNames}
              onChange={(e) => setInterviewerNames(e.target.value)}
            />
          </Field>

          <button
            className="btn btn--primary"
            type="submit"
            disabled={busy || !typeId}
          >
            {busy ? "Starting" : "Begin interview"}
          </button>
        </form>
      )}
    </div>
  );
}
