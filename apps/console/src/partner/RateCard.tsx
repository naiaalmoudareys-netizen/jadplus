/**
 * The partner office's rate card (ADR 0025; S9, P1): the prices in force today, accepted cards that start
 * later, and every change the company proposed with JAD+'s decision. A new card is proposed in full, with 60
 * days' notice, and counts only once JAD+ accepts it.
 */
import { SERVICES, rateCardResponse } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { dateTime, dayText, fils } from '../lib/format';
import { DECISION_LABELS, RATE_UNIT_LABELS } from '../lib/labels';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Empty, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';
import { ProposeChange } from './rate/ProposeChange';

type Card = NonNullable<z.infer<typeof rateCardResponse>['current']>;
type Change = z.infer<typeof rateCardResponse>['changes'][number];

const serviceName = (code: string): string => SERVICES.find((s) => s.code === code)?.name ?? code;

function CardTable({ card }: { card: Card }): ReactNode {
  return (
    <>
      <p className="hint">
        Valid {dayText(card.effectiveFrom)} to {dayText(card.validUntil)}
      </p>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">Item</th>
            <th scope="col">Unit</th>
            <th scope="col" className="num">
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {card.items.map((i) => (
            <tr key={`${i.serviceCode}|${i.item}|${i.unit}`}>
              <td>{serviceName(i.serviceCode)}</td>
              <td>{i.item}</td>
              <td>{RATE_UNIT_LABELS[i.unit] ?? i.unit}</td>
              <td className="num">{fils(i.priceFils)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function History({ changes }: { changes: readonly Change[] }): ReactNode {
  return (
    <Section title="Changes sent to JAD+" count={changes.length}>
      {changes.length === 0 ? (
        <Empty>No changes proposed yet.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Sent</th>
              <th scope="col">Starts</th>
              <th scope="col" className="num">
                Lines
              </th>
              <th scope="col">Decision</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c) => {
              const [text, tone] = DECISION_LABELS[c.status];
              return (
                <tr key={c.id}>
                  <td>{dateTime(c.proposedAt)}</td>
                  <td>{dayText(c.effectiveFrom)}</td>
                  <td className="num">{c.items}</td>
                  <td>
                    <Tag tone={tone}>{text}</Tag>
                    {c.decidedAt === null ? null : <span className="hint">{dateTime(c.decidedAt)}</span>}
                    {c.reason === null ? null : <span className="block muted">{c.reason}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function RateCard(): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const [proposing, setProposing] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(() => api.get('/api/partner/rate-card', rateCardResponse), 'rate-card');
  return (
    <>
      <PageHeader eyebrow="Partner office" title="Rate card">
        {proposing ? null : (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDone(null);
              setProposing(true);
            }}
          >
            Propose a change
          </button>
        )}
      </PageHeader>
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      <Loaded state={state} reload={reload}>
        {(r) => (
          <>
            {proposing ? (
              <ProposeChange
                current={r.current?.items ?? []}
                now={now}
                onSent={(message) => {
                  setProposing(false);
                  setDone(message);
                  reload();
                }}
                onCancel={() => {
                  setProposing(false);
                }}
              />
            ) : null}
            <Section title="Prices today">
              {r.current === null ? (
                <Empty>No accepted rate card yet.</Empty>
              ) : (
                <CardTable card={r.current} />
              )}
            </Section>
            {r.upcoming.map((card) => (
              <Section key={card.changeId} title={`From ${dayText(card.effectiveFrom)}`}>
                <CardTable card={card} />
              </Section>
            ))}
            <History changes={r.changes} />
          </>
        )}
      </Loaded>
    </>
  );
}
