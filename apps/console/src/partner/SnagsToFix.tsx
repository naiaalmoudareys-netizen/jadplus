/**
 * "Snags to fix" (ADR 0032, 0036; O3): its own page in the handover team's workspace. Every open snag on a
 * snagging request with a report, which the JAD Global handover team (the developer side) fixes. Each is marked
 * fixed with a photo; the owner then confirms or reopens it.
 */
import { snagsToFixResponse } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { snagContext } from '../lib/reports';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Loaded, PageHeader, Section } from '../ui/parts';
import { SnagRow } from './job/Snags';

const FIX_ONLY = { canAdd: false, canFix: true } as const;

export function SnagsToFix(): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(() => api.get('/api/partner/snags', snagsToFixResponse), 'snags-to-fix');
  return (
    <>
      <PageHeader title="Snags to fix">
        <button type="button" className="btn btn-outline" onClick={reload}>
          Refresh
        </button>
      </PageHeader>
      <Loaded state={state} reload={reload}>
        {({ snags }) => (
          <Section title="Open snags" count={snags.length}>
            {snags.length === 0 ? (
              <Empty explain="When an inspector’s report lists snags in a unit, each one appears here until it is fixed and the owner confirms it.">
                No snags waiting for a fix.
              </Empty>
            ) : (
              <ul className="plain">
                {snags.map((s) => (
                  <SnagRow
                    key={s.id}
                    requestId={s.requestId}
                    snag={s}
                    list={FIX_ONLY}
                    context={snagContext(s)}
                    onChanged={reload}
                  />
                ))}
              </ul>
            )}
          </Section>
        )}
      </Loaded>
    </>
  );
}
