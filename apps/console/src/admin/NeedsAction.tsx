/**
 * JAD+ Admin "Needs action" (ADR 0023; E4-E7, R4, A7, A1, A3, ADR 0011): everything late or waiting for JAD+,
 * grouped by kind, most urgent first. Each request opens its page; desk requests show their type and age.
 */
import { adminAttentionResponse } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { attentionTiming, groupAttention, type AttentionItem } from '../lib/attention';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Link, Loaded, PageHeader } from '../ui/parts';

/** Unit and Partner columns only for groups whose items have them (an on-call gap has neither). */
function Row({ item, now, places }: { item: AttentionItem; now: number; places: boolean }): ReactNode {
  const timing = attentionTiming(item, now);
  return (
    <tr>
      <td>
        {item.requestId === null ? (
          item.deskId === null ? (
            item.kind === 'on_call_gap' ? (
              <Link to={{ name: 'on_call' }}>{item.what}</Link>
            ) : (
              <span>{item.what}</span>
            )
          ) : (
            <Link to={{ name: 'desk_item', id: item.deskId }}>{item.what}</Link>
          )
        ) : (
          <Link to={{ name: 'request', id: item.requestId }}>
            <span className="ref">{item.ref}</span> {item.what}
          </Link>
        )}
      </td>
      {places ? (
        <>
          <td>{item.unit ?? <span className="hint">Not on file</span>}</td>
          <td>{item.partnerName ?? <span className="hint">Not assigned</span>}</td>
        </>
      ) : null}
      <td className={timing.startsWith('Overdue') ? 'late' : undefined}>{timing}</td>
    </tr>
  );
}

export function NeedsAction(): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const { state, reload } = useLoad(
    () => api.get('/api/admin/attention', adminAttentionResponse),
    'attention',
  );
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Needs action">
        <button type="button" className="btn btn-outline" onClick={reload}>
          Refresh
        </button>
      </PageHeader>
      <Loaded state={state} reload={reload}>
        {({ items }) => {
          const groups = groupAttention(items);
          if (groups.length === 0) {
            return <p className="card muted">Nothing needs action right now.</p>;
          }
          return groups.map((g) => {
            const places = g.items.some((i) => i.unit !== null || i.partnerName !== null);
            return (
              <section key={g.kind} className="card">
                <h2 className="section-title">
                  {g.title} <span className="count">{g.items.length}</span>
                </h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">What</th>
                      {places ? (
                        <>
                          <th scope="col">Unit</th>
                          <th scope="col">Partner</th>
                        </>
                      ) : null}
                      <th scope="col">{g.kind === 'on_call_gap' ? 'When' : 'How long'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((item) => (
                      <Row
                        key={item.requestId ?? item.deskId ?? `${item.kind}:${item.since}`}
                        item={item}
                        now={now}
                        places={places}
                      />
                    ))}
                  </tbody>
                </table>
              </section>
            );
          });
        }}
      </Loaded>
    </>
  );
}
