/**
 * One managed unit, for the property management team's office (ADR 0034; O4, A1, U4, U5): the arrangement, the
 * tenant (invite, extend, end), repairs (decide the tenant's requests) and the monthly statements for the owner.
 * The API answers 404 for a unit the company does not manage today (C-AZ-2).
 */
import { officeManagedUnitResponse } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { apiPath } from '../lib/api';
import { SOURCE_LABELS, periodText } from '../lib/managed';
import { useConsole, useLoad } from '../ui/hooks';
import { Fact, Loaded, Notice, PageHeader, Tag } from '../ui/parts';
import { Statements } from './managed/Statements';
import { TenancyCard } from './managed/TenancyCard';
import { UnitRequests } from './managed/UnitRequests';

export function ManagedUnit({ id }: { id: string }): ReactNode {
  const { api } = useConsole();
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(
    () => api.get(apiPath('partner', 'managed-units', id), officeManagedUnitResponse),
    id,
  );
  const changed = (message: string): void => {
    setDone(message);
    reload();
  };
  return (
    <Loaded state={state} reload={reload}>
      {(d) => (
        <>
          <PageHeader eyebrow="Managed unit" title={d.unit.unitName ?? d.unit.sfUnitId}>
            <Tag tone="good">Managed by {d.unit.providerName}</Tag>
          </PageHeader>
          {done === null ? null : <Notice tone="good">{done}</Notice>}
          <section className="card">
            <dl className="facts">
              <Fact label="Project">{d.unit.project ?? '—'}</Fact>
              <Fact label="Period">{periodText(d.unit.since, d.unit.until)}</Fact>
              <Fact label="Started by">{SOURCE_LABELS[d.unit.source]}</Fact>
            </dl>
          </section>
          <TenancyCard d={d} onChanged={changed} />
          <UnitRequests d={d} onChanged={changed} />
          <Statements d={d} onChanged={changed} />
        </>
      )}
    </Loaded>
  );
}
