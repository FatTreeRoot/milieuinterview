import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatScore } from "@milieu/shared";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import type { InterviewSummary, Stats } from "../lib/types";
import { Empty, OutcomeBadge, PageHead, formatDate } from "../components/ui";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function Home() {
  const { user, capabilities } = useSession();
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void api
      .get<{ interviews: InterviewSummary[] }>("/api/interviews")
      .then((r) => setInterviews(r.interviews))
      .catch(() => undefined);
    void api
      .get<{ stats: Stats }>("/api/stats")
      .then((r) => setStats(r.stats))
      .catch(() => undefined);
  }, []);

  const drafts = interviews.filter((i) => i.status === "draft");
  const recent = interviews.filter((i) => i.status === "completed").slice(0, 6);

  return (
    <div className="page-width">
      <PageHead
        title={`${greeting()}, ${user?.name.split(" ")[0] ?? ""}`}
        lede="Run an interview, manage the question library, or look back at past interviews."
      />

      {/* The main thing anyone comes here to do, so it leads the page. */}
      <div className="primary-action">
        <Link className="btn btn--primary" to="/interview/new">
          Start an Interview
        </Link>
      </div>

      {!capabilities.ai ? (
        <div className="banner" style={{ marginBottom: 18 }}>
          The AI features are switched off because no API key is configured.
          Interviews can still be run and notes saved.
        </div>
      ) : null}

      {drafts.length > 0 ? (
        <section style={{ marginBottom: 26 }}>
          <h2 style={{ marginBottom: 12 }}>Interviews in Progress</h2>
          <div className="stack">
            {drafts.map((interview) => (
              <Link
                key={interview.id}
                to={`/interview/${interview.id}`}
                className="card row-between"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div>
                  <strong>{interview.candidateName}</strong>
                  <div className="subtle">
                    {interview.typeName}
                    {interview.position ? ` · ${interview.position}` : ""} ·
                    started {formatDate(interview.startedAt)}
                  </div>
                </div>
                <span className="badge badge--neutral">Resume</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {stats && stats.totals.completed > 0 ? (
        <section style={{ marginBottom: 26 }}>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2>At a Glance</h2>
            <Link className="btn btn--secondary btn--sm" to="/dashboard">
              Dashboard
            </Link>
          </div>
          <div className="grid-3">
            <div className="stat">
              <div className="value">{stats.totals.completed}</div>
              <div className="label">Interviews Completed</div>
            </div>
            <div className="stat">
              <div className="value">
                {Math.round((stats.totals.passed / stats.totals.completed) * 100)}%
              </div>
              <div className="label">Above Threshold</div>
            </div>
            <div className="stat">
              <div className="value">
                {stats.totals.averageScore === null
                  ? "-"
                  : formatScore(stats.totals.averageScore)}
              </div>
              <div className="label">Average Score</div>
            </div>
          </div>
        </section>
      ) : null}

      <section>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2>Recent Interviews</h2>
          <Link className="btn btn--secondary btn--sm" to="/history">
            See All
          </Link>
        </div>

        <div className="card card--flush">
          {recent.length === 0 ? (
            <Empty>
              No completed interviews yet. Starting one will bring it here.
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
                  </tr>
                </thead>
                <tbody>
                  {recent.map((interview) => (
                    <tr key={interview.id}>
                      <td>
                        <Link to={`/interview/${interview.id}/review`}>
                          {interview.candidateName}
                        </Link>
                      </td>
                      <td className="muted">{interview.typeName}</td>
                      <td className="muted num">
                        {formatDate(interview.startedAt)}
                      </td>
                      <td>
                        <OutcomeBadge
                          passed={interview.passed}
                          borderline={interview.borderline}
                          score={interview.score}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
