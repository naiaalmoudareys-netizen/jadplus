/**
 * The partner office's dispatch day (ADR 0025; R3, E4, E17): a row per technician with the day's visits on a
 * 09:00-18:00 grid, technicians away that day greyed out, and the jobs nobody is sent to yet on the side, with
 * the suggested technician first (available, with the skill, fewest visits). The office decides; the API checks
 * that the technician is an active member of this company (C-AZ-2).
 */
import { assignTechnicianBody, dispatchResponse, type Dispatch as DayPlan } from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { apiPath, withQuery } from '../lib/api';
import { today, shiftDay, weekdayOf } from '../lib/dates';
import { choiceOrder, hourLabels, placeVisit } from '../lib/dispatch';
import { dayText, deadlineText, windowText } from '../lib/format';
import { SKILL_LABELS, UNAVAILABLE_LABELS } from '../lib/labels';
import { formatRoute } from '../lib/router';
import { technicianAssignedResponse } from '../lib/schemas';
import { useAction } from '../ui/actions';
import { navigate, useConsole, useLoad, useNow } from '../ui/hooks';
import { Empty, Link, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';

type Technician = DayPlan['technicians'][number];
type Unassigned = DayPlan['unassigned'][number];

function TechnicianRow({ t, date, now }: { t: Technician; date: string; now: number }): ReactNode {
  const placed = t.visits.map((v) => ({ v, at: placeVisit(v.windowStart, v.windowEnd, date) }));
  const outside = placed.filter((p) => p.at === null);
  return (
    <div className={t.available ? 'dispatch-row' : 'dispatch-row dispatch-away'}>
      <div className="dispatch-who">
        <Link to={{ name: 'technician', id: t.id }}>{t.name}</Link>
        <span className="hint block">
          {t.available
            ? t.skills.map((s) => SKILL_LABELS[s]).join(', ') || 'No skills listed'
            : t.unavailableReason === null
              ? 'Away'
              : UNAVAILABLE_LABELS[t.unavailableReason]}
        </span>
      </div>
      <div className="dispatch-grid">
        {placed.map(({ v, at }) =>
          at === null ? null : (
            <a
              key={v.requestId}
              href={formatRoute({ name: 'request', id: v.requestId })}
              className={`visit gs-${String(at.start)} ge-${String(at.end)}`}
              title={windowText(v.windowStart, v.windowEnd, now)}
            >
              <strong>{v.ref}</strong> {v.service ?? ''}
              <span className="block">{v.building ?? ''}</span>
            </a>
          ),
        )}
      </div>
      {outside.length === 0 ? null : (
        <p className="hint dispatch-outside">
          Outside 09:00-18:00:{' '}
          {outside.map(({ v }) => (
            <span key={v.requestId}>
              <Link to={{ name: 'request', id: v.requestId }}>{v.ref}</Link>{' '}
              {windowText(v.windowStart, v.windowEnd, now)}{' '}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function Assign({
  job,
  technicians,
  onAssigned,
}: {
  job: Unassigned;
  technicians: readonly Technician[];
  onAssigned: () => void;
}): ReactNode {
  const { api } = useConsole();
  const options = choiceOrder(technicians, job.suggested);
  const [chosen, setChosen] = useState(options[0]?.suggested === true ? options[0].technician.id : '');
  const action = useAction();
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = assignTechnicianBody.safeParse({ technicianId: chosen });
    if (!body.success) return;
    action.run(async () => {
      await api.post(apiPath('partner', 'jobs', job.id, 'technician'), body.data, technicianAssignedResponse);
      onAssigned();
    });
  };
  return (
    <form className="inline-form" onSubmit={save}>
      <label className="field">
        <span className="label">Who goes</span>
        <select
          value={chosen}
          onChange={(e) => {
            setChosen(e.target.value);
          }}
        >
          <option value="">Choose…</option>
          {options.map(({ technician: t, suggested }) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {suggested ? ' (suggested)' : t.available ? '' : ' (away)'}
            </option>
          ))}
        </select>
      </label>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div>
        <button type="submit" className="btn btn-small" disabled={action.busy || chosen === ''}>
          {action.busy ? 'Saving…' : 'Assign'}
        </button>
      </div>
    </form>
  );
}

function UnassignedList({
  plan,
  now,
  onAssigned,
}: {
  plan: DayPlan;
  now: number;
  onAssigned: () => void;
}): ReactNode {
  return (
    <Section title="No technician yet" count={plan.unassigned.length}>
      {plan.unassigned.length === 0 ? (
        <Empty>Every open job has a technician.</Empty>
      ) : (
        <ul className="jobs">
          {plan.unassigned.map((j) => {
            const due = deadlineText(j.nextDueAt, now);
            const first = plan.technicians.find((t) => t.id === j.suggested[0]);
            return (
              <li key={j.id} className="job">
                <p>
                  <Link to={{ name: 'request', id: j.id }}>
                    <span className="ref">{j.ref}</span> {j.service ?? 'Service request'}
                  </Link>{' '}
                  {j.emergency ? <Tag tone="bad">Emergency</Tag> : null}
                </p>
                <p className="muted">
                  {j.building ?? 'Building with JAD+'}
                  {j.skill === null ? '' : ` · needs ${SKILL_LABELS[j.skill]}`}
                </p>
                {due === null ? null : <p className={due.startsWith('Overdue') ? 'late' : 'muted'}>{due}</p>}
                {first === undefined ? null : <p className="hint">Suggested: {first.name}</p>}
                <Assign job={j} technicians={plan.technicians} onAssigned={onAssigned} />
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export function Dispatch({ date }: { date: string | null }): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const day = date ?? today(now);
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/partner/dispatch', { date: day }), dispatchResponse),
    `dispatch:${day}`,
  );
  const go = (to: string | null): void => {
    navigate({ name: 'dispatch', date: to });
  };
  return (
    <>
      <PageHeader title="Dispatch">
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              go(shiftDay(day, -1));
            }}
          >
            Previous day
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              go(null);
            }}
          >
            Today
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              go(shiftDay(day, 1));
            }}
          >
            Next day
          </button>
        </div>
      </PageHeader>
      <p className="dispatch-day">
        {weekdayOf(day)} {dayText(day)}
      </p>
      <Loaded state={state} reload={reload}>
        {(plan) => (
          <div className="dispatch">
            <Section title="Technicians" count={plan.technicians.length}>
              {plan.technicians.length === 0 ? (
                <Empty>Add technicians on the Team page.</Empty>
              ) : (
                <div className="dispatch-board">
                  <div className="dispatch-row dispatch-head" aria-hidden="true">
                    <div className="dispatch-who" />
                    <div className="dispatch-grid">
                      {hourLabels().map((h, i) => (
                        <span key={h} className={`hour gs-${String(i * 2 + 1)} ge-${String(i * 2 + 3)}`}>
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                  {plan.technicians.map((t) => (
                    <TechnicianRow key={t.id} t={t} date={plan.date} now={now} />
                  ))}
                </div>
              )}
            </Section>
            <UnassignedList plan={plan} now={now} onAssigned={reload} />
          </div>
        )}
      </Loaded>
    </>
  );
}
