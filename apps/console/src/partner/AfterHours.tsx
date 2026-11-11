/**
 * The partner office's after-hours contact (ADR 0025; E5-E7): for each of the next 8 weeks, which technician
 * takes emergency calls outside working hours. JAD+ records it; it is not yet used by the escalation job
 * (ADR 0025, known gaps).
 */
import {
  afterHoursResponse,
  partnerTeamResponse,
  setAfterHoursBody,
  type PartnerTeam,
} from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { withQuery } from '../lib/api';
import { shiftDay } from '../lib/dates';
import { dayText } from '../lib/format';
import { useAction } from '../ui/actions';
import { useConsole, useLoad } from '../ui/hooks';
import { Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';

type Week = z.infer<typeof afterHoursResponse>['weeks'][number];

function WeekRow({
  week,
  team,
  onSaved,
}: {
  week: Week;
  team: PartnerTeam['technicians'];
  onSaved: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [chosen, setChosen] = useState(week.technicianId ?? '');
  const action = useAction();
  const save = (technicianId: string): void => {
    setChosen(technicianId);
    const body = setAfterHoursBody.safeParse({
      weekStarting: week.weekStarting,
      technicianId: technicianId === '' ? null : technicianId,
    });
    if (!body.success) return;
    action.run(async () => {
      await api.put('/api/partner/after-hours', body.data, afterHoursResponse);
      onSaved();
    });
  };
  const gone = week.technicianId !== null && !team.some((t) => t.id === week.technicianId);
  return (
    <tr>
      <td>Week of {dayText(week.weekStarting)}</td>
      <td>
        <select
          aria-label={`After-hours contact for the week of ${dayText(week.weekStarting)}`}
          value={chosen}
          disabled={action.busy}
          onChange={(e) => {
            save(e.target.value);
          }}
        >
          <option value="">Nobody chosen</option>
          {gone ? (
            <option value={week.technicianId ?? ''}>{week.name ?? 'No longer on the team'}</option>
          ) : null}
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      </td>
      <td>
        {action.busy ? (
          <span className="muted">Saving…</span>
        ) : week.technicianId === null ? (
          <Tag tone="warn">Nobody</Tag>
        ) : (
          <Tag tone="good">Covered</Tag>
        )}
      </td>
    </tr>
  );
}

export function AfterHours(): ReactNode {
  const { api } = useConsole();
  const [from, setFrom] = useState<string | null>(null);
  const { state, reload } = useLoad(
    () =>
      Promise.all([
        api.get(withQuery('/api/partner/after-hours', { from }), afterHoursResponse),
        api.get('/api/partner/team', partnerTeamResponse),
      ]),
    `after-hours:${from ?? ''}`,
  );
  return (
    <>
      <PageHeader title="After-hours" />
      <Loaded state={state} reload={reload}>
        {([{ weeks }, team]) => {
          const first = weeks[0]?.weekStarting;
          return (
            <Section
              title="Emergency calls outside working hours"
              actions={
                first === undefined ? null : (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-outline btn-small"
                      onClick={() => {
                        setFrom(shiftDay(first, -56));
                      }}
                    >
                      Earlier
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-small"
                      onClick={() => {
                        setFrom(null);
                      }}
                    >
                      This week
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-small"
                      onClick={() => {
                        setFrom(shiftDay(first, 56));
                      }}
                    >
                      Later
                    </button>
                  </div>
                )
              }
            >
              <p className="hint">
                Choose who JAD+ reaches for an emergency at night and at weekends, week by week.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Week</th>
                    <th scope="col">Technician</th>
                    <th scope="col">Cover</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => (
                    <WeekRow
                      key={`${w.weekStarting}:${w.technicianId ?? ''}`}
                      week={w}
                      team={team.technicians}
                      onSaved={reload}
                    />
                  ))}
                </tbody>
              </table>
            </Section>
          );
        }}
      </Loaded>
    </>
  );
}
