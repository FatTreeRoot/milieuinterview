import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatScore } from "@milieu/shared";
import { api } from "../lib/api";
import type { InterviewSummary, Stats } from "../lib/types";
import { Empty, OutcomeBadge, PageHead, formatDate } from "../components/ui";

/**
 * Charts are drawn as inline SVG in the style guide's own colours.
 *
 * Brand colours never encode a result, so outcome is carried by the status
 * ramp (green for above threshold, red for below, amber for borderline) and
 * every colour is paired with a label or a number so the reading survives
 * greyscale and colour blindness.
 */

const COLOURS = {
  blue: "var(--color-brand-blue)",
  favourable: "var(--color-fav)",
  unfavourable: "var(--color-unfav-strong)",
  warn: "var(--color-warn)",
  track: "var(--color-neutral-light)",
  grid: "var(--color-border)",
  text: "var(--color-text-muted)",
};

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString("en-CA", { month: "short" });
}

/** Interviews per month, split into above and below threshold. */
function VolumeChart({ data }: { data: Stats["byMonth"] }) {
  const width = 640;
  const height = 200;
  const padding = { top: 12, right: 12, bottom: 28, left: 32 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(...data.map((d) => d.count), 1);
  const step = plotWidth / Math.max(data.length, 1);
  const barWidth = Math.min(step * 0.6, 44);

  // Four gridlines is enough to read a value without crowding the plot.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Interviews per month. ${data
        .map((d) => `${d.month}: ${d.count}, ${d.passed} above threshold`)
        .join(". ")}`}
    >
      {[...new Set(ticks)].map((tick) => {
        const y = padding.top + plotHeight - (tick / max) * plotHeight;
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke={COLOURS.grid}
              strokeWidth="1"
            />
            <text
              x={padding.left - 6}
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
        const x = padding.left + index * step + (step - barWidth) / 2;
        const total = (month.count / max) * plotHeight;
        const passed = (month.passed / max) * plotHeight;
        return (
          <g key={month.month}>
            {/* Full bar is the month's volume; the filled portion passed. */}
            <rect
              x={x}
              y={padding.top + plotHeight - total}
              width={barWidth}
              height={total}
              fill={COLOURS.track}
              rx="3"
            />
            <rect
              x={x}
              y={padding.top + plotHeight - passed}
              width={barWidth}
              height={passed}
              fill={COLOURS.favourable}
              rx="3"
            />
            <text
              x={x + barWidth / 2}
              y={height - 10}
              textAnchor="middle"
              fontSize="10"
              fill={COLOURS.text}
            >
              {monthLabel(month.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Every completed interview as a dot against its threshold. */
function ScoreScatter({ interviews }: { interviews: InterviewSummary[] }) {
  const width = 640;
  const height = 210;
  const padding = { top: 14, right: 14, bottom: 28, left: 32 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const ordered = [...interviews].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const step = plotWidth / Math.max(ordered.length, 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Scores over time for ${ordered.length} interviews, out of 10.`}
    >
      {[0, 2.5, 5, 7.5, 10].map((tick) => {
        const y = padding.top + plotHeight - (tick / 10) * plotHeight;
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke={COLOURS.grid}
              strokeWidth="1"
            />
            <text
              x={padding.left - 6}
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
        const cx = padding.left + index * step + step / 2;
        const cy = padding.top + plotHeight - (score / 10) * plotHeight;
        const colour = interview.borderline
          ? COLOURS.warn
          : interview.passed
            ? COLOURS.favourable
            : COLOURS.unfavourable;
        return (
          <g key={interview.id}>
            {/* Shape carries the outcome as well as colour: passes are
                filled circles, misses are hollow squares. */}
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);

  useEffect(() => {
    void api
      .get<{ stats: Stats }>("/api/stats")
      .then((r) => setStats(r.stats))
      .catch(() => undefined);
    void api
      .get<{ interviews: InterviewSummary[] }>("/api/interviews")
      .then((r) => setInterviews(r.interviews))
      .catch(() => undefined);
  }, []);

  const completed = useMemo(
    () => interviews.filter((i) => i.status === "completed" && i.score !== null),
    [interviews],
  );

  const flagged = useMemo(
    () => completed.filter((i) => i.redFlagCount > 0).length,
    [completed],
  );

  if (!stats) return <p className="muted">Loading</p>;

  if (stats.totals.completed === 0) {
    return (
      <div className="page-width">
        <PageHead
          title="Dashboard"
          lede="Results and trends across every interview."
        />
        <div className="card">
          <Empty>
            Nothing to show yet. Once interviews are completed, their results
            and trends appear here.
          </Empty>
        </div>
      </div>
    );
  }

  const passRate = Math.round((stats.totals.passed / stats.totals.completed) * 100);
  const busiestType = stats.byType[0];

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

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="value">{stats.totals.completed}</div>
          <div className="label">Interviews Completed</div>
        </div>
        <div className="stat">
          <div className="value">{passRate}%</div>
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
        <div className="stat">
          <div className="value">{stats.totals.borderline}</div>
          <div className="label">Borderline</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row-between" style={{ marginBottom: 6 }}>
          <h2>Interviews by Month</h2>
          <span className="subtle">
            <span className="legend-dot" style={{ background: COLOURS.favourable }} />
            Above threshold
            <span
              className="legend-dot"
              style={{ background: COLOURS.track, marginLeft: 12 }}
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
        <ScoreScatter interviews={completed} />
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <h2 style={{ marginBottom: 14 }}>By Interview Type</h2>
          {stats.byType.map((row) => {
            const rate = row.count === 0 ? 0 : (row.passed / row.count) * 100;
            return (
              <div key={row.typeName} className="bar-row">
                <span
                  className="muted"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={row.typeName}
                >
                  {row.typeName}
                </span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{
                      width: `${rate}%`,
                      background: COLOURS.favourable,
                    }}
                  />
                </span>
                <span className="num muted">
                  {row.passed}/{row.count}
                </span>
              </div>
            );
          })}
          <div className="subtle" style={{ marginTop: 10 }}>
            Share of each type's interviews that landed above threshold.
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 14 }}>Averages</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Interview Type</th>
                  <th className="num">Run</th>
                  <th className="num">Average</th>
                </tr>
              </thead>
              <tbody>
                {stats.byType.map((row) => (
                  <tr key={row.typeName}>
                    <td>{row.typeName}</td>
                    <td className="num">{row.count}</td>
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
          {busiestType ? (
            <div className="subtle" style={{ marginTop: 10 }}>
              Most used: {busiestType.typeName}. {flagged} interview
              {flagged === 1 ? "" : "s"} carried a flag raised during the
              conversation.
            </div>
          ) : null}
        </div>
      </div>

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
              {completed.slice(0, 8).map((interview) => (
                <tr key={interview.id}>
                  <td>
                    <Link to={`/interview/${interview.id}/review`}>
                      {interview.candidateName}
                    </Link>
                  </td>
                  <td className="muted">{interview.typeName}</td>
                  <td className="muted num">{formatDate(interview.startedAt)}</td>
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
      </div>
    </div>
  );
}
