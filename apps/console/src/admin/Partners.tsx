/**
 * JAD+ Admin "Partners" (ADR 0023; S6, S7, P3): each partner's standing, team size, open jobs and documents
 * (red when lapsed or missing, amber within 30 days). JAD+ Admin suspends or reinstates with a reason, which
 * is audited; a viewer only reads. The review list from the daily check follows.
 */
import { adminPartnersResponse, partnerStatusBody } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { ApiError, apiPath } from '../lib/api';
import { documentLines } from '../lib/documents';
import { partnerStatusChangedResponse } from '../lib/schemas';
import { canChange } from '../lib/session';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Loaded, Notice, PageHeader, ReasonForm, Tag } from '../ui/parts';
import { PartnerReview } from './PartnerReview';

type Partner = z.infer<typeof adminPartnersResponse>['partners'][number];

const STANDING = {
  active: { tone: 'good', label: 'Active' },
  suspended: { tone: 'bad', label: 'Suspended' },
  ended: { tone: 'calm', label: 'Contract ended' },
} as const;

function PartnerRow({
  partner,
  now,
  editable,
  onChanged,
}: {
  partner: Partner;
  now: number;
  editable: boolean;
  onChanged: (message: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const [editing, setEditing] = useState(false);
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
  const standing = STANDING[partner.status];
  return (
    <tr>
      <td>
        <strong>{partner.name}</strong>
      </td>
      <td>
        <Tag tone={standing.tone}>{standing.label}</Tag>
        {partner.statusReason === null ? null : <span className="block muted">{partner.statusReason}</span>}
      </td>
      <td className="num">{partner.technicians}</td>
      <td className="num">{partner.openJobs}</td>
      <td>
        <ul className="plain">
          {documentLines(partner.documents, now).map((d) => (
            <li key={d.label}>
              {d.label}: <Tag tone={d.tone}>{d.text}</Tag>
            </li>
          ))}
        </ul>
      </td>
      {editable ? (
        <td>
          {partner.status === 'ended' ? null : editing ? (
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
          ) : (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setEditing(true);
              }}
            >
              {target === 'active' ? 'Reinstate' : 'Suspend'}
            </button>
          )}
        </td>
      ) : null}
    </tr>
  );
}

export function Partners(): ReactNode {
  const { api, session } = useConsole();
  const now = useNow();
  const editable = canChange(session.role);
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(() => api.get('/api/admin/partners', adminPartnersResponse), 'partners');
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Partners" />
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      <Loaded state={state} reload={reload}>
        {({ partners }) =>
          partners.length === 0 ? (
            <p className="card muted">No partners yet.</p>
          ) : (
            <section className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Partner</th>
                    <th scope="col">Standing</th>
                    <th scope="col" className="num">
                      Technicians
                    </th>
                    <th scope="col" className="num">
                      Open jobs
                    </th>
                    <th scope="col">Documents</th>
                    {editable ? <th scope="col">Change</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <PartnerRow
                      key={p.id}
                      partner={p}
                      now={now}
                      editable={editable}
                      onChanged={(message) => {
                        setDone(message);
                        reload();
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </section>
          )
        }
      </Loaded>
      <PartnerReview editable={editable} />
    </>
  );
}
