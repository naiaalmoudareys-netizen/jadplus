/**
 * Per-technician numbers for the partner office (ADR 0025; S5 real data only, S6, S8): for each technician,
 * jobs done, on time against the 95 % target, average rating against 4.0, repeat visits against 5 %, and
 * open jobs now. For the month shown on the Performance page, or the last 30 days. A technician's own page
 * shows their line for the last 30 days. Ratings are averages only, never one resident's stars.
 */
import { technicianStatsResponse, type TechnicianStats } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { withQuery } from '../lib/api';
import { monthText, percentText, starsText } from '../lib/format';
import { meetsTone, teamStatsQuery, type TeamPeriod } from '../lib/stats';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Figure, Link, Loaded, Section, Tag } from '../ui/parts';

type Line = TechnicianStats['technicians'][number];

function Value({ text, meets }: { text: string; meets: boolean | null }): ReactNode {
  return meets === null ? <span className="muted">{text}</span> : <Tag tone={meetsTone(meets)}>{text}</Tag>;
}

function Table({ lines }: { lines: readonly Line[] }): ReactNode {
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Technician</th>
          <th scope="col" className="num">
            Jobs done
          </th>
          <th scope="col">On time</th>
          <th scope="col">Rating</th>
          <th scope="col">Repeat visits</th>
          <th scope="col" className="num">
            Open now
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((t) => (
          <tr key={t.technicianId}>
            <td>
              <Link to={{ name: 'technician', id: t.technicianId }}>{t.name}</Link>
            </td>
            <td className="num">{t.jobsDone}</td>
            <td>
              <Value text={percentText(t.onTimePercent)} meets={t.meets.onTime} />
              <span className="block hint">
                {t.onTime.met} of {t.onTime.total} targets met
              </span>
            </td>
            <td>
              {t.rating.count === 0 ? (
                <span className="muted">No ratings yet</span>
              ) : (
                <>
                  <Value text={starsText(t.rating.average)} meets={t.meets.rating} />
                  <span className="block hint">
                    {t.rating.count === 1 ? '1 rating' : `${String(t.rating.count)} ratings`}
                  </span>
                </>
              )}
            </td>
            <td>
              <Value text={String(t.repeatVisits)} meets={t.meets.repeatVisits} />
              <span className="block hint">{percentText(t.repeatVisitPercent)} of jobs done</span>
            </td>
            <td className="num">{t.openJobs}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The whole team, for the Performance page's month or the last 30 days. */
export function TeamNumbers({ month }: { month: string }): ReactNode {
  const { api } = useConsole();
  const [period, setPeriod] = useState<TeamPeriod>('month');
  const { state, reload } = useLoad(
    () =>
      api.get(
        withQuery('/api/partner/technician-stats', teamStatsQuery(period, month)),
        technicianStatsResponse,
      ),
    `team-stats:${period}:${month}`,
  );
  const choices: readonly [TeamPeriod, string][] = [
    ['month', monthText(month)],
    ['recent', 'Last 30 days'],
  ];
  return (
    <Section
      title="By technician"
      actions={
        <div className="segmented" role="group" aria-label="Period">
          {choices.map(([p, text]) => (
            <button
              key={p}
              type="button"
              className={p === period ? 'segment segment-current' : 'segment'}
              aria-pressed={p === period}
              onClick={() => {
                setPeriod(p);
              }}
            >
              {text}
            </button>
          ))}
        </div>
      }
    >
      <Loaded state={state} reload={reload}>
        {(s) =>
          s.technicians.length === 0 ? (
            <Empty>No technicians on the team yet.</Empty>
          ) : (
            <>
              <p className="hint">
                Targets: on time {s.targets.onTimePercent} % or more, rating{' '}
                {s.targets.averageRating.toFixed(1)} or more, repeat visits {s.targets.repeatVisitPercent} %
                or less. A job counts for the technician it is assigned to.
              </p>
              <Table lines={s.technicians} />
            </>
          )
        }
      </Loaded>
    </Section>
  );
}

/** One technician's last 30 days, on their page. */
export function TechnicianNumbers({ id }: { id: string }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get('/api/partner/technician-stats', technicianStatsResponse),
    `technician-stats:${id}`,
  );
  return (
    <Section title="Last 30 days">
      <Loaded state={state} reload={reload}>
        {(s) => {
          const t = s.technicians.find((x) => x.technicianId === id);
          if (t === undefined) return <Empty>No numbers for this technician.</Empty>;
          return (
            <div className="figures">
              <Figure label="Jobs done" value={String(t.jobsDone)} note={`${String(t.openJobs)} open now`} />
              <Figure
                label="On time"
                value={percentText(t.onTimePercent)}
                note={`${String(t.onTime.met)} of ${String(t.onTime.total)} targets met`}
              />
              <Figure
                label="Rating"
                value={starsText(t.rating.average)}
                note={
                  t.rating.count === 0
                    ? 'No ratings yet'
                    : t.rating.count === 1
                      ? 'From 1 rating'
                      : `From ${String(t.rating.count)} ratings`
                }
              />
              <Figure
                label="Repeat visits"
                value={String(t.repeatVisits)}
                note={`${percentText(t.repeatVisitPercent)} of jobs done`}
              />
            </div>
          );
        }}
      </Loaded>
    </Section>
  );
}
