/**
 * A partner's proposed rate cards (ADR 0025; S9, P1): each line next to today's price, the day the new card
 * would start and until when it holds. JAD+ Admin accepts once the new rates were approved in writing (naming
 * who approved), or rejects with a reason the partner sees.
 */
import { adminRateChangesResponse, decideRateChangeBody, officeDecisionResponse } from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import type { z } from 'zod';
import { ApiError, apiPath } from '../../lib/api';
import { dateTime, dayText, fils } from '../../lib/format';
import { DECISION_LABELS, RATE_UNIT_LABELS, label, serviceName } from '../../lib/labels';
import { forPartner, priceChange } from '../../lib/partner-admin';
import { useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Empty, Loaded, Notice, ReasonForm, Section, Tag } from '../../ui/parts';

type Change = z.infer<typeof adminRateChangesResponse>['changes'][number];

function Accept({ change, onDone }: { change: Change; onDone: () => void }): ReactNode {
  const { api } = useConsole();
  const [approvedBy, setApprovedBy] = useState('');
  const action = useAction();
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = decideRateChangeBody.safeParse({ decision: 'accept', approvedBy });
    if (!body.success) return;
    action.run(async () => {
      await api.post(apiPath('admin', 'rate-card-changes', change.id), body.data, officeDecisionResponse);
      onDone();
    });
  };
  return (
    <form className="inline-form" onSubmit={save}>
      <label className="field">
        <span className="label">Approved in writing by</span>
        <input
          value={approvedBy}
          maxLength={120}
          onChange={(e) => {
            setApprovedBy(e.target.value);
          }}
        />
      </label>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div>
        <button
          type="submit"
          className="btn btn-small"
          disabled={action.busy || approvedBy.trim().length < 2}
        >
          {action.busy ? 'Saving…' : 'Accept the new rates'}
        </button>
      </div>
    </form>
  );
}

function ChangeCard({
  change,
  editable,
  onDecided,
}: {
  change: Change;
  editable: boolean;
  onDecided: (message: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const [rejecting, setRejecting] = useState(false);
  const [text, tone] = DECISION_LABELS[change.status];
  const reject = async (reason: string): Promise<void> => {
    const body = decideRateChangeBody.safeParse({ decision: 'reject', reason });
    if (!body.success) throw new ApiError('Say why the change is rejected (at least 3 characters).', 400);
    await api.post(apiPath('admin', 'rate-card-changes', change.id), body.data, officeDecisionResponse);
    onDecided('The rate-card change was rejected. The partner sees the reason.');
  };
  return (
    <div className="rate-change">
      <p>
        <Tag tone={tone}>{text}</Tag> From {dayText(change.effectiveFrom)} to {dayText(change.validUntil)}
        <span className="hint"> · proposed {dateTime(change.proposedAt)}</span>
      </p>
      {change.approvedBy === null ? null : <p className="hint">Approved in writing by {change.approvedBy}</p>}
      {change.reason === null ? null : <p className="muted">{change.reason}</p>}
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">Item</th>
            <th scope="col" className="num">
              Today
            </th>
            <th scope="col" className="num">
              Proposed
            </th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {change.items.map((i) => {
            const diff = priceChange(i.priceFils, i.currentPriceFils);
            return (
              <tr key={`${i.serviceCode}|${i.item}|${i.unit}`}>
                <td>{serviceName(i.serviceCode)}</td>
                <td>
                  {i.item} <span className="hint">{label(RATE_UNIT_LABELS, i.unit)}</span>
                </td>
                <td className="num">{i.currentPriceFils === null ? '—' : fils(i.currentPriceFils)}</td>
                <td className="num">{fils(i.priceFils)}</td>
                <td>
                  <Tag tone={diff.tone}>{diff.text}</Tag>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {editable && change.status === 'pending' ? (
        rejecting ? (
          <ReasonForm
            label="Why reject it? (the partner sees this)"
            submitLabel="Reject"
            minLength={3}
            onSubmit={reject}
            onCancel={() => {
              setRejecting(false);
            }}
          />
        ) : (
          <div className="row-actions decide">
            <Accept
              change={change}
              onDone={() => {
                onDecided('The new rates were accepted. They apply from their start date.');
              }}
            />
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={() => {
                setRejecting(true);
              }}
            >
              Reject
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}

export function RateChanges({ partnerId, editable }: { partnerId: string; editable: boolean }): ReactNode {
  const { api } = useConsole();
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(async () => {
    const lists = await Promise.all(
      (['pending', 'accepted', 'rejected'] as const).map((status) =>
        api.get(`/api/admin/rate-card-changes?status=${status}`, adminRateChangesResponse),
      ),
    );
    return forPartner(
      lists.flatMap((l) => l.changes),
      partnerId,
    );
  }, partnerId);
  return (
    <Section title="Rate-card changes">
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      <Loaded state={state} reload={reload}>
        {(changes) =>
          changes.length === 0 ? (
            <Empty>No rate-card changes proposed.</Empty>
          ) : (
            changes.map((c) => (
              <ChangeCard
                key={c.id}
                change={c}
                editable={editable}
                onDecided={(message) => {
                  setDone(message);
                  reload();
                }}
              />
            ))
          )
        }
      </Loaded>
    </Section>
  );
}
