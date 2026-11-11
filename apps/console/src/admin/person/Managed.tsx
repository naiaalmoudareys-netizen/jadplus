/**
 * Managed units of an owner, for JAD+ Admin (ADR 0034; O4): per unit owned, whether a JAD Global property
 * management team runs it now, and since when. JAD+ Admin may set a unit as managed (team, first day, optional
 * last day) or end the management now; both are audited by the API. Viewers read only.
 */
import {
  adminManagedUnitsResponse,
  adminPartnersResponse,
  dubaiDate,
  managedSetResponse,
  setManagedBody,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { z } from 'zod';
import { apiPath, withQuery } from '../../lib/api';
import { SOURCE_LABELS, periodText } from '../../lib/managed';
import { ConfirmButton, useAction } from '../../ui/actions';
import { useConsole, useLoad, useNow } from '../../ui/hooks';
import { Loaded, Notice, Section, Tag } from '../../ui/parts';

interface Unit {
  readonly sfUnitId: string;
  readonly unitName: string;
  readonly project: string | null;
}

const ended = z.object({ id: z.string(), endedAt: z.number() });

function SetManaged({
  ownerUserId,
  unit,
  teams,
  onDone,
  onCancel,
}: {
  ownerUserId: string;
  unit: Unit;
  teams: readonly { id: string; name: string }[];
  onDone: () => void;
  onCancel: () => void;
}): ReactNode {
  const { api } = useConsole();
  const today = dubaiDate(useNow());
  const [providerId, setProviderId] = useState(teams[0]?.id ?? '');
  const [since, setSince] = useState(today);
  const [until, setUntil] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = setManagedBody.safeParse({
      sfUnitId: unit.sfUnitId,
      ownerUserId,
      providerId,
      since,
      until: until === '' ? null : until,
    });
    if (!body.success) {
      setProblem('Choose the team and the first day.');
      return;
    }
    setProblem(null);
    action.run(async () => {
      await api.post('/api/admin/managed-units', body.data, managedSetResponse);
      onDone();
    });
  };
  if (teams.length === 0) {
    return <Notice tone="warn">Add a JAD Global property management team on the Partners page first.</Notice>;
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span className="label">Managed by</span>
          <select
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
            }}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">First day</span>
          <input
            type="date"
            value={since}
            max={today}
            onChange={(e) => {
              setSince(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Last day (optional)</span>
          <input
            type="date"
            value={until}
            min={today}
            onChange={(e) => {
              setUntil(e.target.value);
            }}
          />
        </label>
      </div>
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Saving…' : 'Set as managed'}
        </button>
        <button type="button" className="btn btn-outline" disabled={action.busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ManagedUnitsOfOwner({
  ownerUserId,
  units,
  editable,
  onChanged,
}: {
  ownerUserId: string;
  units: readonly Unit[];
  editable: boolean;
  onChanged: (message: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const [open, setOpen] = useState<string | null>(null);
  const { state, reload } = useLoad(
    () =>
      Promise.all([
        api.get(withQuery('/api/admin/managed-units', { ownerUserId }), adminManagedUnitsResponse),
        api.get('/api/admin/partners', adminPartnersResponse),
      ]),
    ownerUserId,
  );
  const changed = (message: string): void => {
    setOpen(null);
    reload();
    onChanged(message);
  };
  return (
    <Section title="Property management">
      <Loaded state={state} reload={reload}>
        {([managed, { partners }]) => {
          const teams = partners.filter((p) => p.kind === 'jad_group' && p.status !== 'ended');
          return (
            <ul className="plain stack">
              {units.map((u) => {
                const now = managed.units.find((m) => m.sfUnitId === u.sfUnitId && m.current);
                return (
                  <li key={u.sfUnitId}>
                    <strong>{u.unitName}</strong>{' '}
                    {now === undefined ? (
                      <Tag tone="calm">Not managed</Tag>
                    ) : (
                      <>
                        <Tag tone="good">Managed by {now.providerName}</Tag>{' '}
                        <span className="hint">
                          {periodText(now.since, now.until)} · {SOURCE_LABELS[now.source]}
                        </span>
                      </>
                    )}
                    {!editable ? null : now !== undefined ? (
                      <ConfirmButton
                        label="End management"
                        question="The owner looks after the tenant and decides the tenant's requests again from now."
                        onConfirm={async () => {
                          await api.post(apiPath('admin', 'managed-units', now.id, 'end'), {}, ended);
                          changed(`${u.unitName} is no longer managed.`);
                        }}
                      />
                    ) : open === u.sfUnitId ? (
                      <SetManaged
                        ownerUserId={ownerUserId}
                        unit={u}
                        teams={teams}
                        onDone={() => {
                          changed(`${u.unitName} is now managed.`);
                        }}
                        onCancel={() => {
                          setOpen(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline btn-small"
                        onClick={() => {
                          setOpen(u.sfUnitId);
                        }}
                      >
                        Set as managed
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          );
        }}
      </Loaded>
    </Section>
  );
}
