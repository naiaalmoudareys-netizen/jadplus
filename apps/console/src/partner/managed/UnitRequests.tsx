/**
 * Repairs on a managed unit since the management started (ADR 0034; A1): the tenant's requests wait for the
 * managing team's decision. Approve sends the request to the team's maintenance company (or the normal routing);
 * decline closes it and the tenant is told. The owner's own requests are shown for information only.
 */
import { STATUSES, type OfficeManagedUnitDetail, type Status } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { apiPath } from '../../lib/api';
import { dateTime, humanize } from '../../lib/format';
import { ConfirmButton, useAction } from '../../ui/actions';
import { useConsole } from '../../ui/hooks';
import { Empty, Notice, Section, StatusTag, Tag } from '../../ui/parts';

type ManagedRequest = OfficeManagedUnitDetail['requests'][number];

const decided = z.object({ id: z.string(), status: z.string() });
const isStatus = (s: string): s is Status => (STATUSES as readonly string[]).includes(s);

/** Waiting for the managing team: a tenant's request still awaiting a decision. */
export function waitsForManager(r: ManagedRequest): boolean {
  return r.status === 'awaiting_owner' && r.raisedBy === 'tenant';
}

function Decide({
  unitId,
  r,
  onChanged,
}: {
  unitId: string;
  r: ManagedRequest;
  onChanged: (m: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const action = useAction();
  const path = apiPath('partner', 'managed-units', unitId, 'requests', r.id, 'approval');
  return (
    <div className="row-actions">
      <button
        type="button"
        className="btn btn-small"
        disabled={action.busy}
        onClick={() => {
          action.run(async () => {
            await api.post(path, { decision: 'approve' }, decided);
            onChanged(`${r.ref} was approved and sent for the repair.`);
          });
        }}
      >
        {action.busy ? 'Saving…' : 'Approve'}
      </button>
      <ConfirmButton
        label="Decline"
        question="The request closes and the tenant is told it was declined."
        onConfirm={async () => {
          await api.post(path, { decision: 'decline' }, decided);
          onChanged(`${r.ref} was declined.`);
        }}
      />
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </div>
  );
}

export function UnitRequests({
  d,
  onChanged,
}: {
  d: OfficeManagedUnitDetail;
  onChanged: (m: string) => void;
}): ReactNode {
  return (
    <Section title="Repairs" count={d.requests.length}>
      {d.requests.length === 0 ? (
        <Empty>No repair requests since the management started.</Empty>
      ) : (
        <ul className="plain stack">
          {d.requests.map((r) => (
            <li key={r.id} className="card">
              <p>
                <span className="ref">{r.ref}</span> {humanize(r.serviceCode)}{' '}
                {r.isEmergency ? <Tag tone="bad">Emergency</Tag> : null}{' '}
                {isStatus(r.status) ? <StatusTag status={r.status} /> : null}{' '}
                <span className="hint">
                  {r.raisedBy === 'tenant' ? 'From the tenant' : 'From the owner'} · {dateTime(r.createdAt)}
                </span>
              </p>
              <p>{r.description}</p>
              {waitsForManager(r) ? <Decide unitId={d.unit.id} r={r} onChanged={onChanged} /> : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
