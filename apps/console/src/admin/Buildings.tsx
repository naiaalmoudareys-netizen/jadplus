/**
 * JAD+ Admin "Buildings" (ADR 0025; E12, V1): every project and building with owners' units, how many open
 * requests, building management contacts and notices showing now. Each row opens the building page (contacts,
 * notices, home guide). Units whose building Salesforce does not name are counted under the project.
 */
import { adminBuildingsResponse, buildingKey, type AdminBuildings } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Link, Loaded, PageHeader, Section } from '../ui/parts';
import { SortHeader, useSort } from '../ui/table';

type Row = AdminBuildings['buildings'][number];
type Column = 'project' | 'building' | 'units' | 'openRequests' | 'contacts' | 'currentNotices';

function value(row: Row, key: Column): string | number | null {
  return row[key];
}

function Table({ rows }: { rows: readonly Row[] }): ReactNode {
  const sorted = useSort<Row, Column>(rows, { key: 'project', dir: 'asc' }, value);
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Project" column="project" sorted={sorted} />
          <SortHeader label="Building" column="building" sorted={sorted} />
          <SortHeader label="Units" column="units" sorted={sorted} numeric />
          <SortHeader label="Open requests" column="openRequests" sorted={sorted} numeric />
          <SortHeader label="Contacts" column="contacts" sorted={sorted} numeric />
          <SortHeader label="Notices now" column="currentNotices" sorted={sorted} numeric />
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((b) => (
          <tr key={buildingKey(b)}>
            <td>
              <Link to={{ name: 'building', project: b.project, building: null }}>{b.project}</Link>
            </td>
            <td>
              {b.building === null ? (
                <span className="muted">Not named</span>
              ) : (
                <Link to={{ name: 'building', project: b.project, building: b.building }}>{b.building}</Link>
              )}
            </td>
            <td className="num">{b.units}</td>
            <td className="num">{b.openRequests}</td>
            <td className={b.contacts === 0 ? 'num late' : 'num'}>{b.contacts}</td>
            <td className="num">{b.currentNotices}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Buildings(): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get('/api/admin/buildings', adminBuildingsResponse),
    'buildings',
  );
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Buildings" />
      <Loaded state={state} reload={reload}>
        {({ buildings }) => (
          <Section title="Projects and buildings" count={buildings.length}>
            <p className="hint">
              Open a project for notices and guide text for all its buildings, or a building for its own. A
              building without a contact (in red) cannot be reached in an emergency (E12).
            </p>
            {buildings.length === 0 ? (
              <Empty>No owners' units are linked yet.</Empty>
            ) : (
              <Table rows={buildings} />
            )}
          </Section>
        )}
      </Loaded>
    </>
  );
}
