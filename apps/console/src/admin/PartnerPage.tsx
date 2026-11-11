/**
 * One partner, for JAD+ Admin (ADR 0023, 0025, 0030; S5-S10, P1, P3): its kind (outside partner or JAD Global
 * team), standing (with suspend / reinstate), the verified licence and insurance, uploads waiting to be
 * verified, proposed rate cards and the monthly scorecard. A viewer reads everything and changes nothing.
 */
import { adminPartnersResponse } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { documentLines } from '../lib/documents';
import { PROVIDER_KIND_LABELS } from '../lib/providers';
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
        return (
          <>
            <PageHeader eyebrow="Partner" title={partner.name}>
              <Tag tone={PROVIDER_KIND_LABELS[partner.kind].tone}>
                {PROVIDER_KIND_LABELS[partner.kind].label}
              </Tag>
              <Tag tone={standing.tone}>{standing.label}</Tag>
            </PageHeader>
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
            <RateChanges partnerId={id} editable={editable} />
            <PartnerScorecard partnerId={id} />
            {partner.kind === 'jad_group' ? <ManagedUnits providerId={id} editable={editable} /> : null}
          </>
        );
      }}
    </Loaded>
  );
}
