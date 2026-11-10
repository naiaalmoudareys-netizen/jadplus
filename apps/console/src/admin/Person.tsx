/**
 * One person, for JAD+ Admin (ADR 0025; U4, U5, U8, U9, L1): name and contact, roles, the units they own,
 * tenancies, requests, desk requests, what they agreed to (terms, make-safe limit, marketing) and how many
 * devices they are signed in on. Opening this page is recorded in the audit log (personal data). JAD+ Admin
 * can sign them out everywhere, freeze the account, extend or end a tenancy and raise a request for an owner.
 */
import { adminPersonResponse } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { apiPath } from '../lib/api';
import { dateTime, humanize } from '../lib/format';
import { ACCOUNT_LABELS, DESK_TONES, ROLE_LABELS, label } from '../lib/labels';
import { canChange } from '../lib/session';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Fact, Link, Loaded, Notice, PageHeader, Section, StatusTag, Tag } from '../ui/parts';
import { AccountActions } from './person/Account';
import { RaiseForOwner } from './person/Raise';
import { Tenancies } from './person/Tenancies';

const CONSENT_LABELS = {
  terms: 'Terms of use',
  make_safe_cap: 'Make-safe limit',
  marketing: 'News and offers',
} as const;

export function Person({ id }: { id: string }): ReactNode {
  const { api, session } = useConsole();
  const editable = canChange(session.role);
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(() => api.get(apiPath('admin', 'people', id), adminPersonResponse), id);
  const changed = (message: string): void => {
    setDone(message);
    reload();
  };
  return (
    <Loaded state={state} reload={reload}>
      {(p) => {
        const [standing, tone] = ACCOUNT_LABELS[p.status];
        const isOwner = p.roles.some((r) => r.role === 'owner');
        return (
          <>
            <PageHeader eyebrow="Person" title={p.name ?? 'No name on file'}>
              <Tag tone={tone}>{standing}</Tag>
            </PageHeader>
            {done === null ? null : <Notice tone="good">{done}</Notice>}
            <section className="card">
              <dl className="facts">
                <Fact label="Email">{p.email ?? '—'}</Fact>
                <Fact label="Mobile">{p.phone ?? '—'}</Fact>
                <Fact label="Roles">
                  {p.roles.length === 0 ? '—' : p.roles.map((r) => label(ROLE_LABELS, r.role)).join(', ')}
                </Fact>
                <Fact label="Signed in on">
                  {p.activeSessions === 1 ? '1 device' : `${String(p.activeSessions)} devices`}
                </Fact>
              </dl>
              <p className="hint">Viewing this page is recorded in the audit log.</p>
            </section>
            {editable ? (
              <AccountActions
                id={p.id}
                status={p.status}
                activeSessions={p.activeSessions}
                onChanged={changed}
              />
            ) : null}
            <div className="columns">
              <Section title="Units owned" count={p.ownerUnits.length}>
                {p.ownerUnits.length === 0 ? (
                  <Empty>No units owned.</Empty>
                ) : (
                  <ul className="plain">
                    {p.ownerUnits.map((u) => (
                      <li key={u.sfUnitId}>
                        <strong>{u.unitName}</strong>
                        {u.project === null ? null : <span className="muted"> · {u.project}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title="Agreements">
                {p.consents.length === 0 ? (
                  <Empty>Nothing accepted yet.</Empty>
                ) : (
                  <ul className="plain">
                    {p.consents.map((c) => (
                      <li key={`${c.kind}:${String(c.at)}`}>
                        {CONSENT_LABELS[c.kind]}: {c.accepted ? 'yes' : 'no'}{' '}
                        <span className="hint">
                          version {c.version}, {dateTime(c.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
            {editable && isOwner && p.status === 'active' && p.ownerUnits.length > 0 ? (
              <RaiseForOwner ownerUserId={p.id} units={p.ownerUnits} />
            ) : null}
            <Tenancies tenancies={p.tenancies} editable={editable} onChanged={changed} />
            <div className="columns">
              <Section title="Requests" count={p.requests.length}>
                {p.requests.length === 0 ? (
                  <Empty>No requests.</Empty>
                ) : (
                  <table className="table">
                    <tbody>
                      {p.requests.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <Link to={{ name: 'request', id: r.id }}>
                              <span className="ref">{r.ref}</span> {r.serviceName ?? 'Request'}
                            </Link>
                            {r.emergency ? <Tag tone="bad">Emergency</Tag> : null}
                          </td>
                          <td>
                            <StatusTag status={r.status} />
                          </td>
                          <td className="hint">{dateTime(r.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
              <Section title="Desk requests" count={p.deskRequests.length}>
                {p.deskRequests.length === 0 ? (
                  <Empty>No desk requests.</Empty>
                ) : (
                  <table className="table">
                    <tbody>
                      {p.deskRequests.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <Link to={{ name: 'desk_item', id: r.id }}>{r.type}</Link>
                          </td>
                          <td>
                            <Tag tone={DESK_TONES[r.status]}>{humanize(r.status)}</Tag>
                          </td>
                          <td className="hint">{dateTime(r.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
            </div>
          </>
        );
      }}
    </Loaded>
  );
}
