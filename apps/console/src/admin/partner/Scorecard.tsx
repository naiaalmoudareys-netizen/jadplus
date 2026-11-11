/**
 * A partner's monthly scorecard for JAD+ Admin (ADR 0025; S5 real data only, S6): jobs done, on time, rating,
 * repeat visits against the JAD+ targets, SLA results by measure, response and completion times, incidents.
 * "—" means nothing was measured that month, never a made-up figure.
 */
import { monthOf, partnerScorecardResponse } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { apiPath, withQuery } from '../../lib/api';
import { humanize, minutesText, monthText, percentText, ratingText, shiftMonth } from '../../lib/format';
import { SLA_METRIC_LABELS, label } from '../../lib/labels';
import { useConsole, useLoad, useNow } from '../../ui/hooks';
import { Empty, Fact, Loaded, Section, Tag } from '../../ui/parts';

function Meets({ value }: { value: boolean | null }): ReactNode {
  if (value === null) return <Tag tone="calm">No data</Tag>;
  return value ? <Tag tone="good">Meets target</Tag> : <Tag tone="bad">Below target</Tag>;
}

export function PartnerScorecard({ partnerId }: { partnerId: string }): ReactNode {
  const { api } = useConsole();
  const thisMonth = monthOf(useNow());
  const [month, setMonth] = useState(thisMonth);
  const { state, reload } = useLoad(
    () =>
      api.get(
        withQuery(apiPath('admin', 'partners', partnerId, 'scorecard'), { month }),
        partnerScorecardResponse,
      ),
    `${partnerId}:${month}`,
  );
  return (
    <Section
      title={`Scorecard · ${monthText(month)}`}
      actions={
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => {
              setMonth(shiftMonth(month, -1));
            }}
          >
            Previous month
          </button>
          <button
            type="button"
            className="btn btn-outline btn-small"
            disabled={month >= thisMonth}
            onClick={() => {
              setMonth(shiftMonth(month, 1));
            }}
          >
            Next month
          </button>
        </div>
      }
    >
      <Loaded state={state} reload={reload}>
        {(s) => (
          <>
            <dl className="facts">
              <Fact label="Jobs done">{s.jobsDone}</Fact>
              <Fact label={`On time (target ${String(s.targets.onTimePercent)} %)`}>
                {percentText(s.onTimePercent)} <Meets value={s.meets.onTime} />
              </Fact>
              <Fact label={`Rating (target ${s.targets.averageRating.toFixed(1)})`}>
                {ratingText(s.rating.average, s.rating.count)} <Meets value={s.meets.rating} />
              </Fact>
              <Fact label={`Repeat visits (target ≤ ${String(s.targets.repeatVisitPercent)} %)`}>
                {s.repeatVisits} · {percentText(s.repeatVisitPercent)} <Meets value={s.meets.repeatVisits} />
              </Fact>
              <Fact label="Average response">{minutesText(s.averageResponseMinutes)}</Fact>
              <Fact label="Average completion">{minutesText(s.averageCompletionMinutes)}</Fact>
            </dl>
            {s.sla.length === 0 ? (
              <Empty>No service-level targets were measured this month.</Empty>
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
                      <td>{label(SLA_METRIC_LABELS, m.metric)}</td>
                      <td className="num">{m.met}</td>
                      <td className="num">{m.missed}</td>
                      <td className="num">{m.excused}</td>
                      <td className="num">{percentText(m.percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {s.incidents.length === 0 ? null : (
              <p className="hint">
                Incidents: {s.incidents.map((i) => `${humanize(i.kind)} ${String(i.count)}`).join(', ')}
              </p>
            )}
          </>
        )}
      </Loaded>
    </Section>
  );
}
