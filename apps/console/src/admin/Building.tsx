/**
 * One project or building (ADR 0025; E12, V1): the help lines its residents can call (ADR 0029), its building
 * management contacts, the notices its residents see, and its home guide. "Whole project" pages hold what applies to every building of the project.
 */
import type { ReactNode } from 'react';
import { placeName } from '../lib/platform';
import { canChange } from '../lib/session';
import { useConsole } from '../ui/hooks';
import { Link, PageHeader } from '../ui/parts';
import { Contacts } from './building/Contacts';
import { Guide } from './building/Guide';
import { Lines } from './building/Lines';
import { Notices } from './building/Notices';

export function Building({ project, building }: { project: string; building: string | null }): ReactNode {
  const { session } = useConsole();
  const editable = canChange(session.role);
  const place = { project, building };
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin · Buildings" title={placeName(place)}>
        {building === null ? null : (
          <Link to={{ name: 'building', project, building: null }}>Whole project</Link>
        )}
      </PageHeader>
      <p className="hint page-intro">
        <Link to={{ name: 'buildings' }}>All buildings</Link>
      </p>
      <Lines place={place} editable={editable} />
      <Contacts place={place} editable={editable} />
      <Notices place={place} editable={editable} />
      <Guide place={place} editable={editable} />
    </>
  );
}
