/**
 * The partner office's performance (ADR 0025; S5 real data only, S6, S8): the month's scorecard against JAD+'s
 * targets, service levels met per measure, ratings, repeat visits and incidents; residents' feedback without
 * names or units; the month's jobs as a CSV file; each technician's numbers (TeamNumbers); and the last 7, 30
 * or 90 days at a glance.
 */
import { partnerFeedbackResponse, partnerScorecardResponse, type PartnerScorecard } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { withQuery } from '../lib/api';
import { today } from '../lib/dates';
import { dayText, humanize, minutesText, monthText, percentText, shiftMonth, starsText } from '../lib/format';
import { SLA_METRIC_LABELS } from '../lib/labels';
import { FileButton } from '../ui/actions';
import { navigate, useConsole, useLoad, useNow } from '../ui/hooks';
import { Empty, Figure, Loaded, PageHeader, Section, Tag } from '../ui/parts';
import { RecentNumbers } from './Numbers';
import { TeamNumbers } from './TeamNumbers';

function Meets({ value }: { value: boolean | null }): ReactNode {
  if (value === null) return <Tag tone="calm">No data</Tag>;
  return value ? <Tag tone="good">On target</Tag> : <Tag tone="bad">Below target</Tag>;
}

function Scorecard({ s }: { s: PartnerScorecard }): ReactNode {
  const t = s.targets;
  return (
    <>
      <div className="figures">
        <Figure label="Jobs done" value={String(s.jobsDone)} note={monthText(s.month)} />
        <Figure
          label="Average response"
          value={minutesText(s.averageResponseMinutes)}
          note="Assigned to answered"
        />
        <Figure
          label="Average completion"
          value={minutesText(s.averageCompletionMinutes)}
          note="Assigned to work done"
        />
      </div>
      <Section title="Against JAD+ targets">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col" className="num">
                This month
              </th>
              <th scope="col">Target</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>On time</td>
              <td className="num">{percentText(s.onTimePercent)}</td>
              <td className="muted">{t.onTimePercent} % or more</td>
              <td>
                <Meets value={s.meets.onTime} />
              </td>
            </tr>
            <tr>
              <td>Average rating ({s.rating.count})</td>
              <td className="num">{starsText(s.rating.average)}</td>
              <td className="muted">{t.averageRating.toFixed(1)} or more</td>
              <td>
                <Meets value={s.meets.rating} />
              </td>
            </tr>
            <tr>
              <td>Repeat visits ({s.repeatVisits})</td>
              <td className="num">{percentText(s.repeatVisitPercent)}</td>
              <td className="muted">{t.repeatVisitPercent} % or less</td>
              <td>
                <Meets value={s.meets.repeatVisits} />
              </td>
            </tr>
          </tbody>
        </table>
      </Section>
      <div className="columns">
        <Section title="Service levels">
          {s.sla.length === 0 ? (
            <Empty>No service levels measured this month.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  <th scope="col" className="num">
                    Met
                  </th>
                  <th scope="col" className="num">
                    Missed
                  </th>
                  <th scope="col" className="num">
                    Excused
                  </th>
                  <th scope="col" className="num">
                    On time
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.sla.map((m) => (
                  <tr key={m.metric}>
                    <td>{SLA_METRIC_LABELS[m.metric]}</td>
                    <td className="num">{m.met}</td>
                    <td className={m.missed > 0 ? 'num late' : 'num'}>{m.missed}</td>
                    <td className="num">{m.excused}</td>
                    <td className="num">{percentText(m.percent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="Ratings">
          <ul className="stars">
            {[5, 4, 3, 2, 1].map((n) => (
              <li key={n}>
                <span className="stars-label">{n} stars</span>
                <span className="stars-count">{s.rating.stars[n - 1] ?? 0}</span>
              </li>
            ))}
          </ul>
          {s.incidents.length === 0 ? (
            <p className="hint">No incidents this month.</p>
          ) : (
            <>
              <h3 className="label">Incidents</h3>
              <ul className="plain">
                {s.incidents.map((i) => (
                  <li key={i.kind}>
                    {humanize(i.kind)}: <strong>{i.count}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      </div>
    </>
  );
}

function Feedback({ month }: { month: string }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/partner/feedback', { month }), partnerFeedbackResponse),
    `feedback:${month}`,
  );
  return (
    <Section title="What residents said">
      <Loaded state={state} reload={reload}>
        {({ feedback }) =>
          feedback.length === 0 ? (
            <Empty>No ratings this month.</Empty>
          ) : (
            <ul className="messages">
              {feedback.map((f, i) => (
                <li key={`${f.date}:${String(i)}`} className="message">
                  <p className="message-meta">
                    <strong>{f.stars} of 5</strong> · {f.service ?? 'Service'} · {dayText(f.date)}
                  </p>
                  {f.comment === null ? null : <p className="prewrap">{f.comment}</p>}
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
    </Section>
  );
}

export function Performance({ month }: { month: string | null }): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const thisMonth = today(now).slice(0, 7);
  const shown = month ?? thisMonth;
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/partner/scorecard', { month: shown }), partnerScorecardResponse),
    `scorecard:${shown}`,
  );
  const go = (to: string): void => {
    navigate({ name: 'performance', month: to === thisMonth ? null : to });
  };
  return (
    <>
      <PageHeader eyebrow="Partner office" title="Performance">
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              go(shiftMonth(shown, -1));
            }}
          >
            Previous month
          </button>
          <label className="field">
            <span className="label">Month</span>
            <input
              type="month"
              value={shown}
              max={thisMonth}
              onChange={(e) => {
                if (/^\d{4}-\d{2}$/.test(e.target.value)) go(e.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-outline"
            disabled={shown >= thisMonth}
            onClick={() => {
              go(shiftMonth(shown, 1));
            }}
          >
            Next month
          </button>
          <FileButton
            path={withQuery('/api/partner/export.csv', { month: shown })}
            label="Export CSV"
            saveAs={`jadplus-jobs-${shown}.csv`}
          />
        </div>
      </PageHeader>
      <Loaded state={state} reload={reload}>
        {(s) => <Scorecard s={s} />}
      </Loaded>
      <TeamNumbers month={shown} />
      <Feedback month={shown} />
      <RecentNumbers />
    </>
  );
}
