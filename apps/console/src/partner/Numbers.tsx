/**
 * The company's recent numbers (ADR 0023; S5 real data only, S8 never shown to owners): jobs done, SLA targets
 * met, rating and repeat visits over the last 7, 30 or 90 days. A section of the Performance page.
 */
import { partnerStatsResponse } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { withQuery } from '../lib/api';
import { STATS_DAYS, onTimeText, ratingText, type StatsDays } from '../lib/stats';
import { useConsole, useLoad } from '../ui/hooks';
import { Figure, Loaded, Section } from '../ui/parts';

export function RecentNumbers(): ReactNode {
  const { api } = useConsole();
  const [days, setDays] = useState<StatsDays>('30');
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/partner/stats', { days }), partnerStatsResponse),
    `stats:${days}`,
  );
  return (
    <Section
      title="Recent days"
      actions={
        <div className="segmented" role="group" aria-label="Period">
          {STATS_DAYS.map((d) => (
            <button
              key={d}
              type="button"
              className={d === days ? 'segment segment-current' : 'segment'}
              aria-pressed={d === days}
              onClick={() => {
                setDays(d);
              }}
            >
              {d} days
            </button>
          ))}
        </div>
      }
    >
      <Loaded state={state} reload={reload}>
        {(s) => (
          <div className="figures">
            <Figure label="Jobs done" value={String(s.jobsDone)} note={`In the last ${s.days} days`} />
            <Figure
              label="On time"
              value={onTimeText(s.onTime)}
              note={`${s.onTime.met} of ${s.onTime.total} targets met`}
            />
            <Figure
              label="Rating"
              value={ratingText(s.rating)}
              note={s.rating.count === 1 ? 'From 1 rating' : `From ${s.rating.count} ratings`}
            />
            <Figure
              label="Repeat visits"
              value={String(s.repeatVisits)}
              note="Return visits after “not done”"
            />
          </div>
        )}
      </Loaded>
    </Section>
  );
}
