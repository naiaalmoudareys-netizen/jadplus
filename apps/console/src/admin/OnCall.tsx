/**
 * JAD+ Admin "On-call" (ADR 0025; E6, E7): who JAD+ calls when an emergency is not acknowledged, week by week
 * (Monday to Sunday). The first person must be a JAD+ Admin, the second any JAD+ staff member. Eight weeks
 * show at a time; past weeks cannot be changed. JAD+ Admin sets a week; a viewer only reads.
 */
import {
  dubaiDate,
  onCallWeeksResponse,
  setOnCallBody,
  weekStarting,
  type OnCallWeeks,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { ApiError, apiPath, withQuery } from '../lib/api';
import { dayText } from '../lib/format';
import { onCallSetResponse } from '../lib/platform-schemas';
import { onCallPage, weekEditable } from '../lib/platform';
import { canChange } from '../lib/session';
import { useAction } from '../ui/actions';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Loaded, Notice, PageHeader, Tag } from '../ui/parts';

type Week = OnCallWeeks['weeks'][number];
type Candidate = OnCallWeeks['candidates'][number];

function personName(p: Week['first']): ReactNode {
  if (p === null) return <span className="late">Nobody</span>;
  return p.name ?? <span className="muted">No longer JAD+ staff</span>;
}

function WeekForm({
  week,
  candidates,
  onSaved,
  onCancel,
}: {
  week: Week;
  candidates: readonly Candidate[];
  onSaved: () => void;
  onCancel: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [first, setFirst] = useState(week.first?.userId ?? '');
  const [second, setSecond] = useState(week.second?.userId ?? '');
  const action = useAction();
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      const body = setOnCallBody.safeParse({ first, second });
      if (!body.success) {
        throw new ApiError(body.error.issues[0]?.message ?? 'Choose two different people.', 400);
      }
      await api.put(apiPath('admin', 'on-call', week.weekStarting), body.data, onCallSetResponse);
      onSaved();
    });
  };
  const options = (filter: (c: Candidate) => boolean): ReactNode =>
    candidates.filter(filter).map((c) => (
      <option key={c.userId} value={c.userId}>
        {c.name ?? c.userId}
      </option>
    ));
  return (
    <form className="stack" onSubmit={save}>
      <label className="field">
        <span className="label">First (JAD+ Admin)</span>
        <select
          value={first}
          required
          onChange={(e) => {
            setFirst(e.target.value);
          }}
        >
          <option value="">Choose…</option>
          {options((c) => c.canBeFirst)}
        </select>
      </label>
      <label className="field">
        <span className="label">Second (JAD+ staff)</span>
        <select
          value={second}
          required
          onChange={(e) => {
            setSecond(e.target.value);
          }}
        >
          <option value="">Choose…</option>
          {options((c) => c.canBeSecond)}
        </select>
      </label>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button
          type="submit"
          className="btn btn-small"
          disabled={action.busy || first === '' || second === ''}
        >
          {action.busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-outline btn-small" disabled={action.busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function WeekCard({
  week,
  candidates,
  editable,
  onSaved,
}: {
  week: Week;
  candidates: readonly Candidate[];
  editable: boolean;
  onSaved: () => void;
}): ReactNode {
  const [editing, setEditing] = useState(false);
  const missing = week.first === null || week.second === null;
  return (
    <li className={week.current ? 'card week week-current' : 'card week'}>
      <p className="label">Week of</p>
      <p className="week-date">
        {dayText(week.weekStarting)} {week.current ? <Tag tone="good">This week</Tag> : null}
      </p>
      {editing ? (
        <WeekForm
          week={week}
          candidates={candidates}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      ) : (
        <>
          <dl className="mini-facts">
            <dt>First</dt>
            <dd>{personName(week.first)}</dd>
            <dt>Second</dt>
            <dd>{personName(week.second)}</dd>
          </dl>
          {missing ? <p className="late hint">Emergencies need two people on call.</p> : null}
          {editable ? (
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={() => {
                setEditing(true);
              }}
            >
              {missing ? 'Set' : 'Change'}
            </button>
          ) : null}
        </>
      )}
    </li>
  );
}

export function OnCall(): ReactNode {
  const { api, session } = useConsole();
  const now = useNow();
  const thisWeek = weekStarting(dubaiDate(now));
  const [from, setFrom] = useState(thisWeek);
  const [saved, setSaved] = useState(false);
  const editable = canChange(session.role);
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/admin/on-call/weeks', { from }), onCallWeeksResponse),
    from,
  );
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="On-call">
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setFrom(onCallPage(from, -1));
            }}
          >
            Earlier
          </button>
          {from === thisWeek ? null : (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setFrom(thisWeek);
              }}
            >
              This week
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setFrom(onCallPage(from, 1));
            }}
          >
            Later
          </button>
        </div>
      </PageHeader>
      <p className="hint page-intro">
        If an emergency is not acknowledged, the first person is called, then the second (E6, E7).
      </p>
      {saved ? <Notice tone="good">The week was saved.</Notice> : null}
      <Loaded state={state} reload={reload}>
        {({ weeks, candidates }) => (
          <ul className="weeks">
            {weeks.map((w) => (
              <WeekCard
                key={w.weekStarting}
                week={w}
                candidates={candidates}
                editable={editable && weekEditable(w.weekStarting, thisWeek)}
                onSaved={() => {
                  setSaved(true);
                  reload();
                }}
              />
            ))}
          </ul>
        )}
      </Loaded>
    </>
  );
}
