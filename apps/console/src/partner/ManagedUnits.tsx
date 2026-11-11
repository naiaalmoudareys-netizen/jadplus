/**
 * Managed units, for the property management team's office (ADR 0034; O4, A1): the units it manages today, with
 * the tenant's standing, tenant requests waiting for its decision, open repairs and the last statement sent; and
 * the maintenance company its approved repairs go to.
 */
import { officeManagedUnitsResponse } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { monthText } from '../lib/format';
import { TENANT_LABELS, periodText } from '../lib/managed';
import { MaintenanceCompany } from '../managed/MaintenanceCompany';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Link, Loaded, PageHeader, Section, Tag } from '../ui/parts';

export function ManagedUnits(): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get('/api/partner/managed-units', officeManagedUnitsResponse),
    'managed-units',
  );
  return (
    <>
      <PageHeader eyebrow="Partner office" title="Managed units" />
      <Loaded state={state} reload={reload}>
        {({ units }) => (
          <Section title="Units you manage" count={units.length}>
            {units.length === 0 ? (
              <Empty>No units are managed by your company today.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Unit</th>
                    <th scope="col">Period</th>
                    <th scope="col">Tenant</th>
                    <th scope="col">Waiting for you</th>
                    <th scope="col">Open repairs</th>
                    <th scope="col">Last statement</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => {
                    const tenant = u.tenantStatus === null ? null : TENANT_LABELS[u.tenantStatus];
                    return (
                      <tr key={u.id}>
                        <td>
                          <Link to={{ name: 'managed_unit', id: u.id }}>{u.unitName ?? u.sfUnitId}</Link>
                          {u.project === null ? null : <span className="block muted">{u.project}</span>}
                        </td>
                        <td>{periodText(u.since, u.until)}</td>
                        <td>{tenant === null ? 'No tenant' : <Tag tone={tenant[1]}>{tenant[0]}</Tag>}</td>
                        <td>
                          {u.awaitingApproval === 0 ? (
                            '—'
                          ) : (
                            <Tag tone="warn">{`${String(u.awaitingApproval)} to decide`}</Tag>
                          )}
                        </td>
                        <td>{u.openRequests}</td>
                        <td>
                          {u.lastStatementMonth === null ? 'None yet' : monthText(u.lastStatementMonth)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Section>
        )}
      </Loaded>
      <MaintenanceCompany path="/api/partner/manager-settings" editable />
    </>
  );
}
