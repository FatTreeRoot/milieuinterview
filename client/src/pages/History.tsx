import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { InterviewSummary } from "../lib/types";
import {
  Alert,
  ConfirmButton,
  Empty,
  OutcomeBadge,
  PageHead,
  formatDate,
} from "../components/ui";

type Filter = "all" | "draft" | "completed";

export function History() {
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function load() {
    try {
      const result = await api.get<{ interviews: InterviewSummary[] }>(
        "/api/interviews",
      );
      setInterviews(result.interviews);
    } catch {
      setError("Past interviews could not be loaded.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return interviews.filter((interview) => {
      if (filter !== "all" && interview.status !== filter) return false;
      if (!term) return true;
      return (
        interview.candidateName.toLowerCase().includes(term) ||
        (interview.position ?? "").toLowerCase().includes(term) ||
        interview.typeName.toLowerCase().includes(term)
      );
    });
  }, [interviews, filter, search]);

  return (
    <div className="page-width">
      <PageHead
        title="Interview History"
        lede="Every interview, with its documents and evaluation."
        actions={
          <a className="btn btn--secondary btn--sm" href="/api/interviews.csv">
            Export CSV
          </a>
        }
      />

      {error ? <Alert>{error}</Alert> : null}

      <div className="row" style={{ marginBottom: 14 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search candidate, position or type"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(["all", "completed", "draft"] as Filter[]).map((option) => (
          <button
            key={option}
            type="button"
            className={
              filter === option
                ? "btn btn--primary btn--sm"
                : "btn btn--secondary btn--sm"
            }
            onClick={() => setFilter(option)}
          >
            {option === "all"
              ? "All"
              : option === "completed"
                ? "Completed"
                : "In Progress"}
          </button>
        ))}
      </div>

      <div className="card card--flush">
        {visible.length === 0 ? (
          <Empty>
            {interviews.length === 0
              ? "No interviews yet."
              : "Nothing matches that search."}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Interview</th>
                  <th>Date</th>
                  <th>Outcome</th>
                  <th>Flags</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((interview) => (
                  <tr key={interview.id}>
                    <td>
                      <Link
                        to={
                          interview.status === "draft"
                            ? `/interview/${interview.id}`
                            : `/interview/${interview.id}/review`
                        }
                        style={{ fontWeight: 600 }}
                      >
                        {interview.candidateName}
                      </Link>
                      {interview.position ? (
                        <div className="subtle">{interview.position}</div>
                      ) : null}
                    </td>
                    <td className="muted">{interview.typeName}</td>
                    <td className="muted num">
                      {formatDate(interview.startedAt)}
                    </td>
                    <td>
                      {interview.status === "draft" ? (
                        <span className="badge badge--neutral">
                          In Progress
                        </span>
                      ) : (
                        <OutcomeBadge
                          passed={interview.passed}
                          borderline={interview.borderline}
                          score={interview.score}
                        />
                      )}
                    </td>
                    <td className="num muted">
                      {interview.redFlagCount || ""}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <ConfirmButton
                        label="Delete"
                        className="btn btn--ghost btn--sm"
                        title={`Delete the interview with ${interview.candidateName}?`}
                        confirmLabel="Delete it"
                        open={confirming === interview.id}
                        setOpen={(open) =>
                          setConfirming(open ? interview.id : null)
                        }
                        body={
                          <p className="muted">
                            This removes the notes, the documents and the
                            evaluation for good.
                          </p>
                        }
                        onConfirm={() =>
                          void api
                            .delete(`/api/interviews/${interview.id}`)
                            .then(load)
                            .catch(() =>
                              setError("That interview could not be deleted."),
                            )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
