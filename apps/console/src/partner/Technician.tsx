/**
 * One technician of the company (ADR 0025; R3, E17, S5): the skills dispatch suggestions are based on, the days
 * they are away (leave, sickness, training), their visits today and their numbers over the last 30 days. Only the office changes these; the
 * technician sees them in the app.
 */
import {
  SKILLS,
  UNAVAILABLE_REASONS,
  addUnavailableBody,
  dispatchResponse,
  partnerTeamResponse,
  setSkillsBody,
  technicianSkillsResponse,
  technicianUnavailableResponse,
  type Skill,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { apiPath } from '../lib/api';
import { today } from '../lib/dates';
import { dayText, windowText } from '../lib/format';
import { SKILL_LABELS, UNAVAILABLE_LABELS } from '../lib/labels';
import { unavailableAddedResponse } from '../lib/office-schemas';
import { ConfirmButton, useAction } from '../ui/actions';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { useWorkspace } from '../ui/workspace';
import { Empty, Link, Loaded, Notice, PageHeader, Section } from '../ui/parts';
import { TechnicianNumbers } from './TeamNumbers';

type Reason = (typeof UNAVAILABLE_REASONS)[number];

function Skills({
  id,
  initial,
  onSaved,
}: {
  id: string;
  initial: readonly Skill[];
  onSaved: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [chosen, setChosen] = useState<readonly Skill[]>(initial);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = setSkillsBody.safeParse({ skills: SKILLS.filter((s) => chosen.includes(s)) });
    if (!body.success) return;
    action.run(async () => {
      await api.put(apiPath('partner', 'technicians', id, 'skills'), body.data, technicianSkillsResponse);
      setSaved(true);
      onSaved();
    });
  };
  return (
    <form className="stack" onSubmit={save}>
      <div className="form-grid">
        {SKILLS.map((s) => (
          <label key={s} className="check">
            <input
              type="checkbox"
              checked={chosen.includes(s)}
              onChange={(e) => {
                setSaved(false);
                setChosen(e.target.checked ? [...chosen, s] : chosen.filter((x) => x !== s));
              }}
            />
            {SKILL_LABELS[s]}
          </label>
        ))}
      </div>
      {saved ? <Notice tone="good">Skills saved.</Notice> : null}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div>
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Saving…' : 'Save skills'}
        </button>
      </div>
    </form>
  );
}

function AddAway({ id, now, onAdded }: { id: string; now: number; onAdded: () => void }): ReactNode {
  const { api } = useConsole();
  const [from, setFrom] = useState(today(now));
  const [to, setTo] = useState(today(now));
  const [reason, setReason] = useState<Reason>('leave');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const add = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = addUnavailableBody.safeParse({ from, to, reason });
    if (!body.success) {
      setProblem(body.error.issues[0]?.message ?? 'Check the dates.');
      return;
    }
    setProblem(null);
    action.run(async () => {
      await api.post(
        apiPath('partner', 'technicians', id, 'unavailable'),
        body.data,
        unavailableAddedResponse,
      );
      onAdded();
    });
  };
  return (
    <form className="stack" onSubmit={add}>
      <div className="form-grid">
        <label className="field">
          <span className="label">First day away</span>
          <input
            type="date"
            value={from}
            required
            onChange={(e) => {
              setFrom(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Last day away</span>
          <input
            type="date"
            value={to}
            min={from}
            required
            onChange={(e) => {
              setTo(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Why</span>
          <select
            value={reason}
            onChange={(e) => {
              setReason(UNAVAILABLE_REASONS.find((r) => r === e.target.value) ?? 'other');
            }}
          >
            {UNAVAILABLE_REASONS.map((r) => (
              <option key={r} value={r}>
                {UNAVAILABLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Saving…' : 'Add time away'}
        </button>
      </div>
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </form>
  );
}

function Away({ id, now }: { id: string; now: number }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(apiPath('partner', 'technicians', id, 'unavailable'), technicianUnavailableResponse),
    `away:${id}`,
  );
  return (
    <Section title="Time away">
      <Loaded state={state} reload={reload}>
        {({ entries }) =>
          entries.length === 0 ? (
            <Empty>No time away planned.</Empty>
          ) : (
            <ul className="members">
              {entries.map((e) => (
                <li key={e.id} className="member">
                  <span className="member-name">
                    {UNAVAILABLE_LABELS[e.reason]}: {dayText(e.from)}
                    {e.to === e.from ? '' : ` to ${dayText(e.to)}`}
                  </span>
                  <ConfirmButton
                    label="Remove"
                    question="Remove this time away? The technician can be suggested for jobs on these days again."
                    onConfirm={async () => {
                      await api.delete(
                        apiPath('partner', 'technicians', id, 'unavailable', e.id),
                        technicianUnavailableResponse,
                      );
                      reload();
                    }}
                  />
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
      <AddAway id={id} now={now} onAdded={reload} />
    </Section>
  );
}

export function Technician({ id }: { id: string }): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  // ADR 0036: the day plan exists only in a workspace with Dispatch (home visits).
  const dispatches = useWorkspace()?.workspace.pages.includes('dispatch') === true;
  const { state, reload } = useLoad(
    () =>
      Promise.all([
        api.get('/api/partner/team', partnerTeamResponse),
        api.get(apiPath('partner', 'technicians', id, 'skills'), technicianSkillsResponse),
        dispatches ? api.get('/api/partner/dispatch', dispatchResponse) : Promise.resolve(null),
      ]),
    `${id}:${String(dispatches)}`,
  );
  return (
    <Loaded state={state} reload={reload}>
      {([team, skills, plan]) => {
        const member = team.technicians.find((t) => t.id === id);
        const day = plan?.technicians.find((t) => t.id === id);
        const visits = day?.visits ?? [];
        return (
          <>
            <PageHeader eyebrow="Team" title={member?.name ?? 'Technician'}>
              <Link to={{ name: 'team' }}>Back to the team</Link>
            </PageHeader>
            {member === undefined ? (
              <Notice tone="warn">This technician is no longer on your team.</Notice>
            ) : null}
            {plan === null ? null : (
              <div className="columns">
                <Section title="Skills">
                  <p className="hint">Dispatch suggests technicians with the skill a job needs.</p>
                  <Skills id={id} initial={skills.skills} onSaved={reload} />
                </Section>
                <Section title="Visits today" count={visits.length}>
                  {day !== undefined && !day.available ? (
                    <Notice tone="warn">Away today, so not suggested for new jobs.</Notice>
                  ) : null}
                  {visits.length === 0 ? (
                    <Empty>No visits booked today.</Empty>
                  ) : (
                    <ul className="plain">
                      {visits.map((v) => (
                        <li key={v.requestId}>
                          <Link to={{ name: 'request', id: v.requestId }}>
                            <span className="ref">{v.ref}</span> {v.service ?? 'Service request'}
                          </Link>{' '}
                          <span className="muted">{windowText(v.windowStart, v.windowEnd, now)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>
            )}
            {member === undefined ? null : <TechnicianNumbers id={id} />}
            <Away id={id} now={now} />
          </>
        );
      }}
    </Loaded>
  );
}
