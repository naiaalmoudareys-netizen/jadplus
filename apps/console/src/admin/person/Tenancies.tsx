/**
 * A person's tenancies (ADR 0025; U4, U5): as owner or as tenant, with their dates. JAD+ Admin may extend a
 * tenancy or end it early on the owner's behalf (with a reason); both are audited.
 */
import {
  adminReasonBody,
  adminTenancyResponse,
  dubaiDate,
  extendTenancyBody,
  type adminPersonResponse,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import type { z } from 'zod';
import { ApiError, apiPath } from '../../lib/api';
import { dayText, humanize } from '../../lib/format';
import { useAction } from '../../ui/actions';
import { useConsole, useNow } from '../../ui/hooks';
import { Empty, Notice, ReasonForm, Section, Tag } from '../../ui/parts';

type Tenancy = z.infer<typeof adminPersonResponse>['tenancies'][number];

const TONES = { invited: 'warn', active: 'good', ended: 'calm', revoked: 'calm' } as const;

function Extend({
  t,
  onDone,
  onCancel,
}: {
  t: Tenancy;
  onDone: () => void;
  onCancel: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [endsOn, setEndsOn] = useState(t.endsOn);
  const action = useAction();
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = extendTenancyBody.safeParse({ endsOn });
    if (!body.success) return;
    action.run(async () => {
      await api.post(apiPath('admin', 'tenancies', t.id, 'extend'), body.data, adminTenancyResponse);
      onDone();
    });
  };
  return (
    <form className="inline-form" onSubmit={save}>
      <label className="field">
        <span className="label">New last day</span>
        <input
          type="date"
          value={endsOn}
          min={t.endsOn}
          required
          onChange={(e) => {
            setEndsOn(e.target.value);
          }}
        />
      </label>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy || endsOn <= t.endsOn}>
          {action.busy ? 'Saving…' : 'Extend'}
        </button>
        <button type="button" className="btn btn-outline" disabled={action.busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Row({
  t,
  editable,
  today,
  onChanged,
}: {
  t: Tenancy;
  editable: boolean;
  today: string;
  onChanged: (message: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const [open, setOpen] = useState<'extend' | 'end' | null>(null);
  const live = t.status === 'active' || t.status === 'invited';
  const end = async (reason: string): Promise<void> => {
    const body = adminReasonBody.safeParse({ reason });
    if (!body.success) throw new ApiError('Give a reason of at least 3 characters.', 400);
    await api.post(apiPath('admin', 'tenancies', t.id, 'end'), body.data, adminTenancyResponse);
    setOpen(null);
    onChanged('The tenancy was ended. The tenant can no longer raise requests for this residence.');
  };
  return (
    <tr>
      <td>{t.unitName ?? t.sfUnitId}</td>
      <td>{t.side === 'owner' ? 'Owner of the unit' : 'Tenant'}</td>
      <td>
        <Tag tone={TONES[t.status]}>{humanize(t.status)}</Tag>
        {t.status === 'active' && t.endsOn < today ? <Tag tone="warn">Past its end date</Tag> : null}
      </td>
      <td>
        {dayText(t.startsOn)} – {dayText(t.endsOn)}
      </td>
      {editable ? (
        <td>
          {open === 'extend' ? (
            <Extend
              t={t}
              onDone={() => {
                setOpen(null);
                onChanged('The tenancy was extended.');
              }}
              onCancel={() => {
                setOpen(null);
              }}
            />
          ) : open === 'end' ? (
            <ReasonForm
              label="Why end it now?"
              submitLabel="End the tenancy"
              minLength={3}
              explain="Done for the owner. The tenant loses access to this residence at once."
              onSubmit={end}
              onCancel={() => {
                setOpen(null);
              }}
            />
          ) : (
            <div className="row-actions">
              {t.status === 'revoked' ? null : (
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  onClick={() => {
                    setOpen('extend');
                  }}
                >
                  Extend
                </button>
              )}
              {live ? (
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  onClick={() => {
                    setOpen('end');
                  }}
                >
                  End now
                </button>
              ) : null}
            </div>
          )}
        </td>
      ) : null}
    </tr>
  );
}

export function Tenancies({
  tenancies,
  editable,
  onChanged,
}: {
  tenancies: readonly Tenancy[];
  editable: boolean;
  onChanged: (message: string) => void;
}): ReactNode {
  const today = dubaiDate(useNow());
  return (
    <Section title="Tenancies" count={tenancies.length}>
      {tenancies.length === 0 ? (
        <Empty>No tenancies.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Residence</th>
              <th scope="col">As</th>
              <th scope="col">Status</th>
              <th scope="col">Dates</th>
              {editable ? <th scope="col">Change</th> : null}
            </tr>
          </thead>
          <tbody>
            {tenancies.map((t) => (
              <Row key={t.id} t={t} editable={editable} today={today} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
