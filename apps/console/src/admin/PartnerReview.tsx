/**
 * The partner review list (S6, S7, P3; ADR 0006): what the daily check flagged, oldest first. JAD+ Admin
 * resolves an item with a note of what was decided, kept as evidence; a viewer only reads.
 */
import { resolveReviewBody } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { ApiError, apiPath } from '../lib/api';
import { ago } from '../lib/format';
import {
  partnerReviewResponse,
  reviewDetailText,
  reviewKindLabel,
  reviewResolvedResponse,
  type PartnerReviewItem,
} from '../lib/schemas';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Loaded, ReasonForm } from '../ui/parts';

function ReviewRow({
  item,
  now,
  editable,
  onResolved,
}: {
  item: PartnerReviewItem;
  now: number;
  editable: boolean;
  onResolved: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [resolving, setResolving] = useState(false);
  const detail = reviewDetailText(item.detail);
  const resolve = async (note: string): Promise<void> => {
    const body = resolveReviewBody.safeParse({ note });
    if (!body.success) throw new ApiError('Write what was decided.', 400);
    await api.post(apiPath('admin', 'partner-review', item.id, 'resolve'), body.data, reviewResolvedResponse);
    setResolving(false);
    onResolved();
  };
  return (
    <tr>
      <td>
        <strong>{item.partner.name}</strong>
      </td>
      <td>
        {reviewKindLabel(item.kind)}
        {detail === null ? null : <span className="block muted">{detail}</span>}
      </td>
      <td>{ago(item.openedAt, now)}</td>
      {editable ? (
        <td>
          {resolving ? (
            <ReasonForm
              label="What was decided?"
              submitLabel="Resolve"
              minLength={1}
              onSubmit={resolve}
              onCancel={() => {
                setResolving(false);
              }}
            />
          ) : (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setResolving(true);
              }}
            >
              Resolve
            </button>
          )}
        </td>
      ) : null}
    </tr>
  );
}

export function PartnerReview({ editable }: { editable: boolean }): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const { state, reload } = useLoad(
    () => api.get('/api/admin/partner-review?status=open', partnerReviewResponse),
    'review',
  );
  return (
    <section className="card">
      <h2 className="section-title">To review</h2>
      <p className="hint">Flagged by the daily check: ratings, missed emergencies, breaches, documents.</p>
      <Loaded state={state} reload={reload}>
        {({ items }) =>
          items.length === 0 ? (
            <p className="muted">Nothing to review.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Partner</th>
                  <th scope="col">Why</th>
                  <th scope="col">Flagged</th>
                  {editable ? <th scope="col">Decision</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ReviewRow key={item.id} item={item} now={now} editable={editable} onResolved={reload} />
                ))}
              </tbody>
            </table>
          )
        }
      </Loaded>
    </section>
  );
}
