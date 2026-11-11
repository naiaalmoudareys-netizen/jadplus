/**
 * JAD+ Admin's changes to a request (ADR 0025, 0030): move it to another provider of the kind the service takes
 * (E6, S6: the new provider's clock starts now), reclassify an open emergency as routine (E13), cancel it, or
 * mark an old in-house request nobody could take as handled by JAD+ (the resident is asked to confirm). Each
 * needs a reason, kept as an internal note and in the audit log. Only the changes the rules allow now are offered.
 */
import {
  SERVICES,
  adminPartnersResponse,
  adminReasonBody,
  adminReassignBody,
  adminRequestActionResponse,
  providerKindFor,
  type RequestDetail,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { ApiError, apiPath } from '../../lib/api';
import { adminRequestActions } from '../../lib/request-actions';
import { useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Loaded, Notice, ReasonForm, Section } from '../../ui/parts';

type Open = 'reassign' | 'reclassify' | 'cancel' | 'handled' | null;
type ReasonStep = Exclude<Open, 'reassign' | null>;

const REASON_FORM: Readonly<
  Record<ReasonStep, { label: string; submit: string; explain: string; done: string }>
> = {
  reclassify: {
    label: 'Why is this not an emergency?',
    submit: 'Reclassify as routine',
    explain:
      'E13: the emergency clocks stop; a request not yet answered gets the routine 4-working-hour clock.',
    done: 'The request is now routine: the routine clock applies.',
  },
  cancel: {
    label: 'Why cancel?',
    submit: 'Cancel the request',
    explain: 'The request closes as cancelled by JAD+. Booked visits are called off.',
    done: 'The request was cancelled.',
  },
  handled: {
    label: 'How did JAD+ handle it?',
    submit: 'Mark as handled by JAD+',
    explain:
      'For a request raised before JAD Global teams took in-house services. It moves to "work done"; the resident is asked to confirm, and it closes by itself after 72 hours.',
    done: 'The request is marked as handled. The resident is asked to confirm.',
  },
};

function Reassign({
  id,
  current,
  serviceName,
  onDone,
  onCancel,
}: {
  id: string;
  current: string | null;
  serviceName: string | null;
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
        // ADR 0030: JAD Global teams for an in-house service, outside partners for the others.
        const delivery = SERVICES.find((s) => s.name === serviceName)?.delivery;
        const kind = delivery === undefined ? null : providerKindFor(delivery);
        const choices = partners.filter(
          (p) => p.status === 'active' && p.name !== current && (kind === null || p.kind === kind),
        );
        return (
          <form className="inline-form" onSubmit={save}>
            <p className="hint">
              Booked visits are called off and a waiting quote is withdrawn. The new provider must acknowledge
              an emergency within 15 minutes, or meet the service’s first deadline (4 working hours for
              maintenance).
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
  const allowed = adminRequestActions(d.request.status, d.request.emergency, d.request.partnerName !== null);
  if (!allowed.reassign && !allowed.reclassify && !allowed.cancel && !allowed.handled) return null;
  const finish = (message: string): void => {
    setOpen(null);
    setDone(message);
    onChanged();
  };
  const withReason = (step: ReasonStep) => async (reason: string) => {
    const body = adminReasonBody.safeParse({ reason });
    if (!body.success) throw new ApiError('Give a reason of at least 3 characters.', 400);
    await api.post(apiPath('admin', 'requests', d.request.id, step), body.data, adminRequestActionResponse);
    finish(REASON_FORM[step].done);
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
          {allowed.handled ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setOpen('handled');
              }}
            >
              Mark as handled by JAD+
            </button>
          ) : null}
        </div>
      ) : open === 'reassign' ? (
        <Reassign
          id={d.request.id}
          current={d.request.partnerName}
          serviceName={d.request.serviceName}
          onDone={finish}
          onCancel={() => {
            setOpen(null);
          }}
        />
      ) : (
        <ReasonForm
          label={REASON_FORM[open].label}
          submitLabel={REASON_FORM[open].submit}
          minLength={3}
          explain={REASON_FORM[open].explain}
          onSubmit={withReason(open)}
          onCancel={() => {
            setOpen(null);
          }}
        />
      )}
    </Section>
  );
}
