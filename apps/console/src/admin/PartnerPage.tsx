/**
 * One partner, for JAD+ Admin (ADR 0023, 0025, 0030; S5-S10, P1, P3): its kind (outside partner or JAD Global
 * team), standing (with suspend / reinstate), the verified licence and insurance, uploads waiting to be
 * verified, proposed rate cards and the monthly scorecard. A viewer reads everything and changes nothing.
 * ADR 0036: its workspace and the pages its console shows, so JAD+ Admin knows what the provider sees.
 */
import { adminPartnersResponse } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { documentLines } from '../lib/documents';
import { serviceName } from '../lib/labels';
import { PROVIDER_KIND_LABELS } from '../lib/providers';
import { workspaceSummary } from '../lib/workspace';
import { canChange } from '../lib/session';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Fact, Loaded, Notice, PageHeader, Tag } from '../ui/parts';
import { PartnerDocuments } from './partner/Documents';
import { ManagedUnits } from './partner/ManagedUnits';
import { RateChanges } from './partner/RateChanges';
import { PartnerScorecard } from './partner/Scorecard';
import { StandingChange, STANDING } from './Partners';

export function PartnerPage({ id }: { id: string }): ReactNode {
  const { api, session } = useConsole();
  const editable = canChange(session.role);
  const now = useNow();
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(() => api.get('/api/admin/partners', adminPartnersResponse), 'partners');
  return (
    <Loaded state={state} reload={reload}>
      {({ partners }) => {
        const partner = partners.find((p) => p.id === id);
        if (partner === undefined) return <Notice tone="bad">This partner was not found.</Notice>;
        const standing = STANDING[partner.status];
        const ws = workspaceSummary(partner);
        return (
          <>
            <PageHeader
              eyebrow="Partner"
              title={partner.name}
              tags={
                <>
                  <Tag tone={PROVIDER_KIND_LABELS[partner.kind].tone}>
                    {PROVIDER_KIND_LABELS[partner.kind].label}
                  </Tag>
                  <Tag tone={standing.tone}>{standing.label}</Tag>
                </>
              }
            />
            {done === null ? null : <Notice tone="good">{done}</Notice>}
            <section className="card">
              <dl className="facts">
                <Fact label="Standing">
                  {standing.label}
                  {partner.statusReason === null ? null : (
                    <span className="block muted">{partner.statusReason}</span>
                  )}
                </Fact>
                <Fact label="Kind">{PROVIDER_KIND_LABELS[partner.kind].label}</Fact>
                <Fact label="Workspace">
                  {ws.title}
                  <span className="block hint">Its console shows: {ws.pages.join(' · ')}</span>
                </Fact>
                <Fact label="Services">
                  {partner.services.length === 0
                    ? 'None assigned'
                    : partner.services.map(serviceName).join(', ')}
                </Fact>
                <Fact label="Technicians">{partner.technicians}</Fact>
                <Fact label="Open jobs">{partner.openJobs}</Fact>
                <Fact label="Verified documents">
                  <ul className="plain">
                    {documentLines(partner.documents, now).map((d) => (
                      <li key={d.label}>
                        {d.label}: <Tag tone={d.tone}>{d.text}</Tag>
                      </li>
                    ))}
                  </ul>
                </Fact>
              </dl>
              {editable ? (
                <StandingChange
                  partner={partner}
                  onChanged={(message) => {
                    setDone(message);
                    reload();
                  }}
                />
              ) : null}
            </section>
            <PartnerDocuments partnerId={id} editable={editable} />
            {/* JAD Global teams have no rate card (ADR 0036): nothing to change, so no section. */}
            {partner.kind === 'external' ? <RateChanges partnerId={id} editable={editable} /> : null}
            <PartnerScorecard partnerId={id} />
            {partner.kind === 'jad_group' ? <ManagedUnits providerId={id} editable={editable} /> : null}
          </>
        );
      }}
    </Loaded>
  );
}
