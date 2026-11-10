/**
 * The partner office's own numbers (ADR 0023; S5 real data only, S8 never shown to owners): jobs done, SLA
 * targets met, rating and repeat visits over the last 7, 30 or 90 days, for the whole company.
 */
import { partnerStatsResponse } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { onTimeText, ratingText } from '../lib/stats';
import { STATS_DAYS, formatRoute, type StatsDays } from '../lib/router';
import { useConsole, useLoad } from '../ui/hooks';
import { Loaded, PageHeader } from '../ui/parts';

function Figure({ label, value, note }: { label: string; value: string; note: string }): ReactNode {
  return (
    <div className="card figure">
      <p className="label">{label}</p>
      <p className="figure-value">{value}</p>
      <p className="hint">{note}</p>
    </div>
  );
}

export function Numbers({ days }: { days: StatsDays }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(`/api/partner/stats?days=${days}`, partnerStatsResponse),
    days,
  );
  return (
    <>
      <PageHeader eyebrow="Partner office" title="Our numbers">
        <nav className="segmented" aria-label="Period">
          {STATS_DAYS.map((d) => (
            <a
              key={d}
              href={formatRoute({ name: 'numbers', days: d })}
              className={d === days ? 'segment segment-current' : 'segment'}
              aria-current={d === days ? 'page' : undefined}
            >
              {d} days
            </a>
          ))}
        </nav>
      </PageHeader>
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
    </>
  );
}
