/**
 * JAD+ Admin "Partners" (ADR 0023, 0025; S6, S7, S9, P3): each partner's standing, team size, open jobs and
 * documents (red when lapsed or missing, amber within 30 days), what waits for JAD+'s decision (uploaded
 * documents, rate-card changes), and the review list from the daily check. JAD+ Admin suspends or reinstates
 * with a reason, which is audited; a viewer only reads. Each partner opens its own page.
 */
import { adminPartnersResponse, partnerStatusBody } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { ApiError, apiPath } from '../lib/api';
import { documentLines } from '../lib/documents';
import { partnerStatusChangedResponse } from '../lib/schemas';
import { canChange } from '../lib/session';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Empty, Link, Loaded, Notice, PageHeader, ReasonForm, Tag } from '../ui/parts';
import { SortHeader, useSort } from '../ui/table';
import { PendingDecisions } from './partner/Pending';
import { PartnerReview } from './PartnerReview';

type Partner = z.infer<typeof adminPartnersResponse>['partners'][number];
type Column = 'name' | 'status' | 'technicians' | 'open';

export const STANDING = {
  active: { tone: 'good', label: 'Active' },
  suspended: { tone: 'bad', label: 'Suspended' },
  ended: { tone: 'calm', label: 'Contract ended' },
} as const;

/** Suspend or reinstate a partner, with a reason (S6, P3). Nothing for a partner whose contract ended. */
export function StandingChange({
  partner,
  onChanged,
}: {
  partner: Partner;
  onChanged: (message: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const [editing, setEditing] = useState(false);
  if (partner.status === 'ended') return null;
  const target = partner.status === 'active' ? 'suspended' : 'active';
  const change = async (reason: string): Promise<void> => {
    const body = partnerStatusBody.safeParse({ status: target, reason });
    if (!body.success) throw new ApiError('Give a reason of at least 3 characters.', 400);
    await api.post(
      apiPath('admin', 'partners', partner.id, 'status'),
      body.data,
      partnerStatusChangedResponse,
    );
    setEditing(false);
    onChanged(`${partner.name} is now ${target === 'active' ? 'active' : 'suspended'}.`);
  };
  if (!editing) {
    return (
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => {
          setEditing(true);
        }}
      >
        {target === 'active' ? 'Reinstate' : 'Suspend'}
      </button>
    );
  }
  return (
    <ReasonForm
      label={target === 'active' ? 'Why reinstate?' : 'Why suspend?'}
      submitLabel={target === 'active' ? 'Reinstate' : 'Suspend'}
      minLength={3}
      explain={
        target === 'active'
          ? 'The partner can receive new jobs again.'
          : 'The partner gets no new jobs; waiting jobs move to the backup partner.'
      }
      onSubmit={change}
      onCancel={() => {
        setEditing(false);
      }}
    />
  );
}

function PartnerTable({
  partners,
  editable,
  onChanged,
}: {
  partners: readonly Partner[];
  editable: boolean;
  onChanged: (message: string) => void;
}): ReactNode {
  const now = useNow();
  const sorted = useSort<Partner, Column>(partners, { key: 'name', dir: 'asc' }, (p, key) => {
    switch (key) {
      case 'name':
        return p.name;
      case 'status':
        return p.status;
      case 'technicians':
        return p.technicians;
      case 'open':
        return p.openJobs;
    }
  });
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Partner" column="name" sorted={sorted} />
          <SortHeader label="Standing" column="status" sorted={sorted} />
          <SortHeader label="Technicians" column="technicians" sorted={sorted} numeric />
          <SortHeader label="Open jobs" column="open" sorted={sorted} numeric />
          <th scope="col">Documents</th>
          {editable ? <th scope="col">Change</th> : null}
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((p) => {
          const standing = STANDING[p.status];
          return (
            <tr key={p.id}>
              <td>
                <Link to={{ name: 'partner', id: p.id }}>
                  <strong>{p.name}</strong>
                </Link>
              </td>
              <td>
                <Tag tone={standing.tone}>{standing.label}</Tag>
                {p.statusReason === null ? null : <span className="block muted">{p.statusReason}</span>}
              </td>
              <td className="num">{p.technicians}</td>
              <td className="num">{p.openJobs}</td>
              <td>
                <ul className="plain">
                  {documentLines(p.documents, now).map((d) => (
                    <li key={d.label}>
                      {d.label}: <Tag tone={d.tone}>{d.text}</Tag>
                    </li>
                  ))}
                </ul>
              </td>
              {editable ? (
                <td>
                  <StandingChange partner={p} onChanged={onChanged} />
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Partners(): ReactNode {
  const { api, session } = useConsole();
  const editable = canChange(session.role);
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(() => api.get('/api/admin/partners', adminPartnersResponse), 'partners');
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Partners" />
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      <PendingDecisions />
      <Loaded state={state} reload={reload}>
        {({ partners }) => (
          <section className="card">
            {partners.length === 0 ? (
              <Empty>No partners yet.</Empty>
            ) : (
              <PartnerTable
                partners={partners}
                editable={editable}
                onChanged={(message) => {
                  setDone(message);
                  reload();
                }}
              />
            )}
          </section>
        )}
      </Loaded>
      <PartnerReview editable={editable} />
    </>
  );
}
