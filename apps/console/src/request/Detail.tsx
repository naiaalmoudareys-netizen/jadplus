/**
 * One request's facts, shared by JAD+ Admin's request page and the partner office's job page (GET
 * /api/requests/:id, which JAD+ staff and the partner it is assigned to may read): status, place, partner,
 * visit, quote, make-safe work, rating and photos. Photos load through the API after its access check
 * (C-AZ-1); they are never cached (`private, no-store`).
 */
import type { RequestDetail } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { photoUrl } from '../lib/api';
import { aed, dateTime, preferredText, windowText } from '../lib/format';
import { placeText } from '../lib/jobs';
import { Fact, StatusTag, Tag } from '../ui/parts';

const VISIT_LABELS = {
  booked: 'Booked',
  on_the_way: 'On the way',
  arrived: 'Arrived',
  done: 'Done',
} as const;
const QUOTE_LABELS = {
  pending: 'Waiting for the owner',
  approved: 'Approved',
  declined: 'Declined',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
} as const;

export function Photos({
  requestId,
  title,
  photos,
}: {
  requestId: string;
  title: string;
  photos: readonly { id: string }[];
}): ReactNode {
  const [open, setOpen] = useState<string | null>(null);
  if (photos.length === 0) return null;
  return (
    <section className="card">
      <h2 className="section-title">{title}</h2>
      <div className="photos">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={open === p.id ? 'photo photo-open' : 'photo'}
            aria-pressed={open === p.id}
            onClick={() => {
              setOpen(open === p.id ? null : p.id);
            }}
          >
            <img src={photoUrl(requestId, p.id)} alt={`${title}, photo ${i + 1}`} loading="lazy" />
          </button>
        ))}
      </div>
      {open === null ? null : (
        <figure className="photo-large">
          <img src={photoUrl(requestId, open)} alt={`${title}, enlarged`} />
          <figcaption className="hint">Select the photo again to close it.</figcaption>
        </figure>
      )}
    </section>
  );
}

export function Summary({ d, now }: { d: RequestDetail; now: number }): ReactNode {
  const r = d.request;
  return (
    <section className="card">
      <dl className="facts">
        <Fact label="Status">
          <StatusTag status={r.status} />
        </Fact>
        <Fact label="Where">{placeText(r.location)}</Fact>
        <Fact label="Partner">
          {r.partnerName ?? 'Not assigned yet'}
          {r.partnerName !== null && !r.partnerVerified ? <Tag tone="warn">Not verified</Tag> : null}
        </Fact>
        <Fact label="Raised">{dateTime(r.createdAt)}</Fact>
        {r.preferredVisit === null ? null : (
          <Fact label="Preferred visit">{preferredText(r.preferredVisit)}</Fact>
        )}
        {r.arrivalWindow === null ? null : (
          <Fact label="Arrival window">{windowText(r.arrivalWindow.start, r.arrivalWindow.end, now)}</Fact>
        )}
        {d.visit === null ? null : (
          <Fact label="Visit">
            {windowText(d.visit.start, d.visit.end, now)} · {VISIT_LABELS[d.visit.status]}
            {d.visit.technician === null ? '' : ` · ${d.visit.technician}`}
          </Fact>
        )}
        {d.quote === null ? null : (
          <Fact label={`Quote${d.quote.revision > 1 ? ` (revision ${d.quote.revision})` : ''}`}>
            {aed(d.quote.amountAed)} · {QUOTE_LABELS[d.quote.status]} · expires {dateTime(d.quote.expiresAt)}
            <span className="block muted">{d.quote.scope}</span>
          </Fact>
        )}
        {d.makeSafe === null ? null : (
          <Fact label="Make-safe work">
            {aed(d.makeSafe.amountAed)} on {dateTime(d.makeSafe.at)}
            <span className="block muted">{d.makeSafe.scope}</span>
          </Fact>
        )}
        {d.rating === null ? null : (
          <Fact label="Rating">
            {d.rating.stars} of 5{d.rating.comment === null ? '' : ` · “${d.rating.comment}”`}
          </Fact>
        )}
      </dl>
      <h2 className="section-title">Description</h2>
      <p className="prewrap">{r.description}</p>
    </section>
  );
}
