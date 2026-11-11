/**
 * Snags waiting for this company's fix (ADR 0032; O3), at the top of the jobs board: for the JAD Global handover
 * team (the developer side) on every snagging request with a report, and for a snagging provider on its own jobs.
 * Each is marked fixed with a photo; the owner then confirms or reopens it. Nothing shows when none wait.
 */
import { snagsToFixResponse } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { useConsole, useLoad } from '../ui/hooks';
import { Loaded, Section } from '../ui/parts';
import { snagContext } from '../lib/reports';
import { SnagRow } from './job/Snags';

const FIX_ONLY = { canAdd: false, canFix: true } as const;

export function SnagsToFix(): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(() => api.get('/api/partner/snags', snagsToFixResponse), 'snags-to-fix');
  return (
    <Loaded state={state} reload={reload}>
      {({ snags }) =>
        snags.length === 0 ? null : (
          <Section title="Snags to fix" count={snags.length}>
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
          </Section>
        )
      }
    </Loaded>
  );
}
