import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatScore } from "@milieu/shared";
import { api } from "../lib/api";
import type { InterviewSummary } from "../lib/types";
import { Empty, OutcomeBadge, PageHead, formatDate } from "../components/ui";

/**
 * Figures are computed here from the interview list rather than read from
 * /api/stats, so the type filter applies to everything on the page at once
 * without a round trip per change.
 *
 * Charts are inline SVG in the style guide's colours. Brand colours never
 * encode a result, so outcome rides the status ramp, and every mark pairs its
 * colour with a shape or a number so the reading survives greyscale and
 * colour blindness.
 */

const COLOURS = {
  blue: "var(--color-brand-blue)",
  favourable: "var(--color-fav)",
  unfavourable: "var(--color-unfav-strong)",
  warn: "var(--color-warn)",
  // The "total" bar has to read against the card and still let the green
  // "above threshold" bar read against it. No single fill does both: darken it
  // enough to stand out from the card and it loses contrast with the green.
  // So it is a light fill inside a strong outline, which is the style guide's
  // own answer, depth from a thin border rather than a heavier fill.
  track: "var(--color-neutral-light)",
  trackEdge: "var(--color-neutral-mid)",
  grid: "var(--color-border)",
  text: "var(--color-text-muted)",
};

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString("en-CA", {
    month: "short",
  });
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** Interviews started each month, with the share that passed filled in. */
function VolumeChart({
  data,
}: {
  data: { month: string; count: number; passed: number }[];
}) {
  const width = 640;
  const height = 190;
  const pad = { top: 12, right: 12, bottom: 28, left: 32 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(...data.map((d) => d.count), 1);
  const step = plotW / Math.max(data.length, 1);
  const barW = Math.min(step * 0.6, 44);
  const ticks = [...new Set([0, 0.5, 1].map((t) => Math.round(max * t)))];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Interviews by month. ${data
        .map((d) => `${d.month}: ${d.count}, ${d.passed} above threshold`)
        .join(". ")}`}
    >
      {ticks.map((tick) => {
        const y = pad.top + plotH - (tick / max) * plotH;
        return (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y}
              y2={y}
              stroke={COLOURS.grid}
              strokeWidth="1"
            />
            <text
              x={pad.left - 6}
              y={y + 3.5}
              textAnchor="end"
              fontSize="10"
              fill={COLOURS.text}
            >
              {tick}
            </text>
          </g>
        );
      })}

      {data.map((month, index) => {
        const x = pad.left + index * step + (step - barW) / 2;
        const total = (month.count / max) * plotH;
        const passed = (month.passed / max) * plotH;
        return (
          <g key={month.month}>
            <rect
              x={x + 0.5}
              y={pad.top + plotH - total + 0.5}
              width={barW - 1}
              height={Math.max(total - 1, 0)}
              fill={COLOURS.track}
              stroke={COLOURS.trackEdge}
              strokeWidth="1"
              rx="3"
            />
            <rect
              x={x}
              y={pad.top + plotH - passed}
              width={barW}
              height={passed}
              fill={COLOURS.favourable}
              rx="3"
            />
            <text
              x={x + barW / 2}
              y={height - 10}
              textAnchor="middle"
              fontSize="10"
              fill={COLOURS.text}
            >
              {monthLabel(month.month)}
            </text>
            <title>{`${month.month}: ${month.count} interviews, ${month.passed} above threshold`}</title>
          </g>
        );
      })}
    </svg>
  );
}

function ScoreScatter({ interviews }: { interviews: InterviewSummary[] }) {
  const width = 640;
  const height = 200;
  const pad = { top: 14, right: 14, bottom: 28, left: 32 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const ordered = [...interviews].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const step = plotW / Math.max(ordered.length, 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Scores over time for ${ordered.length} interviews, out of 10.`}
    >
      {[0, 2.5, 5, 7.5, 10].map((tick) => {
        const y = pad.top + plotH - (tick / 10) * plotH;
        return (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y}
              y2={y}
              stroke={COLOURS.grid}
              strokeWidth="1"
            />
            <text
              x={pad.left - 6}
              y={y + 3.5}
              textAnchor="end"
              fontSize="10"
              fill={COLOURS.text}
            >
              {tick}
            </text>
          </g>
        );
      })}

      {ordered.map((interview, index) => {
        const score = interview.score ?? 0;
        const cx = pad.left + index * step + step / 2;
        const cy = pad.top + plotH - (score / 10) * plotH;
        const colour = interview.borderline
          ? COLOURS.warn
          : interview.passed
            ? COLOURS.favourable
            : COLOURS.unfavourable;
        return (
          <g key={interview.id}>
            {/* Shape carries the outcome as well as colour. */}
            {interview.passed ? (
              <circle cx={cx} cy={cy} r="5" fill={colour} />
            ) : (
              <rect
                x={cx - 4.5}
                y={cy - 4.5}
                width="9"
                height="9"
                fill="none"
                stroke={colour}
                strokeWidth="2"
              />
            )}
            <title>
              {interview.candidateName}: {formatScore(score)}
            </title>
          </g>
        );
      })}
    </svg>
  );
}

export function Dashboard() {
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // null means every type. A set means only these.
  const [selected, setSelected] = useState<Set<string> | null>(null);

  useEffect(() => {
    void api
      .get<{ interviews: InterviewSummary[] }>("/api/interviews")
      .then((r) => setInterviews(r.interviews))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const allTypes = useMemo(
    () => [...new Set(interviews.map((i) => i.typeName))].sort(),
    [interviews],
  );

  const shown = useMemo(
    () =>
      selected === null
        ? interviews
        : interviews.filter((i) => selected.has(i.typeName)),
    [interviews, selected],
  );

  const stats = useMemo(() => {
    const completed = shown.filter(
      (i) => i.status === "completed" && i.score !== null,
    );

    const months = new Map<string, { count: number; passed: number }>();
    const byType = new Map<
      string,
      { count: number; passed: number; scores: number[] }
    >();

    for (const interview of completed) {
      const key = monthKey(interview.startedAt);
      const m = months.get(key) ?? { count: 0, passed: 0 };
      m.count += 1;
      if (interview.passed) m.passed += 1;
      months.set(key, m);

      const t = byType.get(interview.typeName) ?? {
        count: 0,
        passed: 0,
        scores: [],
      };
      t.count += 1;
      if (interview.passed) t.passed += 1;
      t.scores.push(interview.score as number);
      byType.set(interview.typeName, t);
    }

    return {
      completed: completed.length,
      drafts: shown.filter((i) => i.status === "draft").length,
      passed: completed.filter((i) => i.passed).length,
      borderline: completed.filter((i) => i.borderline).length,
      flagged: completed.filter((i) => i.redFlagCount > 0).length,
      averageScore: mean(completed.map((i) => i.score as number)),
      completedList: completed,
      byMonth: [...months.entries()]
        .map(([month, v]) => ({ month, ...v }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-12),
      byType: [...byType.entries()]
        .map(([typeName, v]) => ({
          typeName,
          count: v.count,
          passed: v.passed,
          averageScore: mean(v.scores),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }, [shown]);

  if (loading) return <p className="muted">Loading</p>;

  if (interviews.length === 0) {
    return (
      <div className="page-width">
        <PageHead
          title="Dashboard"
          lede="Results and trends across every interview."
        />
        <div className="card">
          <Empty>
            Nothing to show yet. Once interviews are conducted, their results
            and trends appear here.
          </Empty>
        </div>
      </div>
    );
  }

  const isOn = (type: string) => selected === null || selected.has(type);
  const toggle = (type: string) => {
    setSelected((current) => {
      const next = new Set(current ?? allTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      // Back to every type selected is the same as no filter at all.
      return next.size === allTypes.length ? null : next;
    });
  };

  const passRate =
    stats.completed === 0 ? null : Math.round((stats.passed / stats.completed) * 100);

  return (
    <div className="page-width">
      <PageHead
        title="Dashboard"
        lede="Results and trends across every interview. Where an interviewer entered their own score, that score is used here instead of the AI's."
        actions={
          <a className="btn btn--secondary btn--sm" href="/api/interviews.csv">
            Export CSV
          </a>
        }
      />

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <h2 style={{ fontSize: 16 }}>Interview Types</h2>
          <div className="row">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setSelected(null)}
              disabled={selected === null}
            >
              Select All
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setSelected(new Set())}
              disabled={selected !== null && selected.size === 0}
            >
              Clear
            </button>
          </div>
        </div>
        <div className="choice-row" style={{ marginBottom: 0 }}>
          {allTypes.map((type) => (
            <button
              key={type}
              type="button"
              className="choice btn--sm"
              aria-pressed={isOn(type)}
              onClick={() => toggle(type)}
            >
              {type}
            </button>
          ))}
        </div>
        {selected !== null ? (
          <div className="subtle" style={{ marginTop: 10 }}>
            Showing {selected.size} of {allTypes.length} interview types.
            Everything below reflects this selection.
          </div>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <Empty>
            No interview types are selected. Choose one above to see results.
          </Empty>
        </div>
      ) : (
        <>
          <div className="grid-4" style={{ marginBottom: 20 }}>
            <div className="stat">
              <div className="value">{stats.completed}</div>
              <div className="label">Interviews Completed</div>
            </div>
            <div className="stat">
              <div className="value">{passRate === null ? "-" : `${passRate}%`}</div>
              <div className="label">Above Threshold</div>
            </div>
            <div className="stat">
              <div className="value">
                {stats.averageScore === null
                  ? "-"
                  : formatScore(stats.averageScore)}
              </div>
              <div className="label">Average Score</div>
            </div>
            <div className="stat">
              <div className="value">{stats.borderline}</div>
              <div className="label">Borderline</div>
            </div>
          </div>

          {stats.completed > 0 ? (
            <>
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="row-between" style={{ marginBottom: 6 }}>
                  <h2>Interviews by Month</h2>
                  <span className="subtle">
                    <span
                      className="legend-dot"
                      style={{ background: COLOURS.favourable }}
                    />
                    Above threshold
                    <span
                      className="legend-dot"
                      style={{
                        background: COLOURS.track,
                        border: `1px solid ${COLOURS.trackEdge}`,
                        marginLeft: 12,
                      }}
                    />
                    Total
                  </span>
                </div>
                <VolumeChart data={stats.byMonth} />
              </div>

              <div className="card" style={{ marginBottom: 18 }}>
                <div className="row-between" style={{ marginBottom: 6 }}>
                  <h2>Scores Over Time</h2>
                  <span className="subtle">
                    Filled circle above threshold, hollow square below
                  </span>
                </div>
                <ScoreScatter interviews={stats.completedList} />
              </div>

              <div className="card card--flush" style={{ marginBottom: 18 }}>
                <div style={{ padding: "16px 18px 6px" }}>
                  <h2>By Interview Type</h2>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Interview Type</th>
                        <th className="num">Completed</th>
                        <th className="num">Above Threshold</th>
                        <th className="num">Average</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.byType.map((row) => (
                        <tr key={row.typeName}>
                          <td>{row.typeName}</td>
                          <td className="num">{row.count}</td>
                          <td className="num">
                            {row.passed}
                            <span className="muted">
                              {" "}
                              ({Math.round((row.passed / row.count) * 100)}%)
                            </span>
                          </td>
                          <td className="num score">
                            {row.averageScore === null
                              ? "-"
                              : formatScore(row.averageScore)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {stats.flagged > 0 ? (
                  <div className="subtle" style={{ padding: "10px 18px 16px" }}>
                    {stats.flagged} interview{stats.flagged === 1 ? "" : "s"}{" "}
                    carried a flag raised during the conversation.
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="card" style={{ marginBottom: 18 }}>
              <Empty>
                None of the selected types have a completed interview yet, so
                there are no scores to chart.
              </Empty>
            </div>
          )}

          <div className="card card--flush">
            <div className="row-between" style={{ padding: "16px 18px 10px" }}>
              <h2>Most Recent</h2>
              <Link className="btn btn--secondary btn--sm" to="/history">
                Interview History
              </Link>
            </div>
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
                  {shown.slice(0, 8).map((interview) => (
                    <tr key={interview.id}>
                      <td>
                        <Link
                          to={
                            interview.status === "draft"
                              ? `/interview/${interview.id}`
                              : `/interview/${interview.id}/review`
                          }
                        >
                          {interview.candidateName}
                        </Link>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
