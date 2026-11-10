/**
 * A request's history (ADR 0025; GET /api/admin/requests/:id/timeline): every step in order, who did it (by
 * role, never by name) and the partner involved. The full record, with who exactly, is in the audit log.
 */
import { adminTimelineResponse } from '@jadplus/shared';
import type { ReactNode } from 'react';
import type { z } from 'zod';
import { apiPath } from '../../lib/api';
import { STATUS_LABELS, dateTime } from '../../lib/format';
import { ROLE_LABELS, eventLabel, label } from '../../lib/labels';
import { eventDetail } from '../../lib/timeline';
import { useConsole, useLoad } from '../../ui/hooks';
import { Empty, Loaded, Section } from '../../ui/parts';

type Event = z.infer<typeof adminTimelineResponse>['events'][number];

function Row({ e }: { e: Event }): ReactNode {
  const detail = eventDetail(e.data);
  return (
    <li className="timeline-item">
      <p className="message-meta">
        {dateTime(e.at)} · {label(ROLE_LABELS, e.actorRole)}
        {e.partnerName === null ? '' : ` · ${e.partnerName}`}
      </p>
      <p>
        <strong>{eventLabel(e.kind)}</strong>
        {e.toStatus === null ? null : (
          <span className="muted">
            {' '}
            {e.fromStatus === null ? '' : `${STATUS_LABELS[e.fromStatus]} → `}
            {STATUS_LABELS[e.toStatus]}
          </span>
        )}
      </p>
      {detail === null ? null : <p className="hint">{detail}</p>}
    </li>
  );
}

export function Timeline({ id, round }: { id: string; round: number }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(apiPath('admin', 'requests', id, 'timeline'), adminTimelineResponse),
    `${id}:${String(round)}`,
  );
  return (
    <Section title="Timeline">
      <Loaded state={state} reload={reload}>
        {({ events }) =>
          events.length === 0 ? (
            <Empty>Nothing recorded yet.</Empty>
          ) : (
            <ol className="timeline">
              {events.map((e, i) => (
                <Row key={`${String(e.at)}:${String(i)}`} e={e} />
              ))}
            </ol>
          )
        }
      </Loaded>
    </Section>
  );
}
