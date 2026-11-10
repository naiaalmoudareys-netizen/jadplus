/**
 * JAD+ Admin's changes to a request (ADR 0025): move it to another partner (E6, S6: the new partner's clock
 * starts now), reclassify an open emergency as routine (E13), or cancel it. Each needs a reason, kept as an
 * internal note and in the audit log. Only the changes the lifecycle allows now are offered.
 */
import {
  adminPartnersResponse,
  adminReasonBody,
  adminReassignBody,
  adminRequestActionResponse,
  type RequestDetail,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { ApiError, apiPath } from '../../lib/api';
import { adminRequestActions } from '../../lib/request-actions';
import { useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Loaded, Notice, ReasonForm, Section } from '../../ui/parts';

type Open = 'reassign' | 'reclassify' | 'cancel' | null;

function Reassign({
  id,
  current,
  onDone,
  onCancel,
}: {
  id: string;
  current: string | null;
  onDone: (message: string) => void;
  onCancel: () => void;
}): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(() => api.get('/api/admin/partners', adminPartnersResponse), 'partners');
  const [partnerId, setPartnerId] = useState('');
  const [reason, setReason] = useState('');
  const action = useAction();
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = adminReassignBody.safeParse({ partnerId, reason });
    if (!body.success) return;
    action.run(async () => {
      await api.post(apiPath('admin', 'requests', id, 'reassign'), body.data, adminRequestActionResponse);
      onDone('The request was moved. The new partner’s clock starts now.');
    });
  };
  return (
    <Loaded state={state} reload={reload}>
      {({ partners }) => {
        const choices = partners.filter((p) => p.status === 'active' && p.name !== current);
        return (
          <form className="inline-form" onSubmit={save}>
            <p className="hint">
              Booked visits are called off and a waiting quote is withdrawn. The new partner must acknowledge
              an emergency within 15 minutes, or answer a routine request within 4 working hours.
            </p>
            <label className="field">
              <span className="label">Move to</span>
              <select
                value={partnerId}
                onChange={(e) => {
                  setPartnerId(e.target.value);
                }}
              >
                <option value="">Choose an active partner…</option>
                {choices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Why?</span>
              <textarea
                value={reason}
                rows={2}
                maxLength={500}
                onChange={(e) => {
                  setReason(e.target.value);
                }}
              />
            </label>
            {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
            <div className="row-actions">
              <button
                type="submit"
                className="btn"
                disabled={action.busy || partnerId === '' || reason.trim().length < 3}
              >
                {action.busy ? 'Saving…' : 'Move the request'}
              </button>
              <button type="button" className="btn btn-outline" disabled={action.busy} onClick={onCancel}>
                Cancel
              </button>
            </div>
          </form>
        );
      }}
    </Loaded>
  );
}

export function RequestActions({ d, onChanged }: { d: RequestDetail; onChanged: () => void }): ReactNode {
  const { api } = useConsole();
  const [open, setOpen] = useState<Open>(null);
  const [done, setDone] = useState<string | null>(null);
  const allowed = adminRequestActions(d.request.status, d.request.emergency);
  if (!allowed.reassign && !allowed.reclassify && !allowed.cancel) return null;
  const finish = (message: string): void => {
    setOpen(null);
    setDone(message);
    onChanged();
  };
  const withReason = (step: 'reclassify' | 'cancel') => async (reason: string) => {
    const body = adminReasonBody.safeParse({ reason });
    if (!body.success) throw new ApiError('Give a reason of at least 3 characters.', 400);
    await api.post(apiPath('admin', 'requests', d.request.id, step), body.data, adminRequestActionResponse);
    finish(
      step === 'cancel'
        ? 'The request was cancelled.'
        : 'The request is now routine: the routine clock applies.',
    );
  };
  return (
    <Section title="JAD+ actions">
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      {open === null ? (
        <div className="row-actions">
          {allowed.reassign ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setOpen('reassign');
              }}
            >
              Move to another partner
            </button>
          ) : null}
          {allowed.reclassify ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setOpen('reclassify');
              }}
            >
              Reclassify as routine
            </button>
          ) : null}
          {allowed.cancel ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setOpen('cancel');
              }}
            >
              Cancel the request
            </button>
          ) : null}
        </div>
      ) : open === 'reassign' ? (
        <Reassign
          id={d.request.id}
          current={d.request.partnerName}
          onDone={finish}
          onCancel={() => {
            setOpen(null);
          }}
        />
      ) : (
        <ReasonForm
          label={open === 'cancel' ? 'Why cancel?' : 'Why is this not an emergency?'}
          submitLabel={open === 'cancel' ? 'Cancel the request' : 'Reclassify as routine'}
          minLength={3}
          explain={
            open === 'cancel'
              ? 'The request closes as cancelled by JAD+. Booked visits are called off.'
              : 'E13: the emergency clocks stop; a request not yet answered gets the routine 4-working-hour clock.'
          }
          onSubmit={withReason(open)}
          onCancel={() => {
            setOpen(null);
          }}
        />
      )}
    </Section>
  );
}
