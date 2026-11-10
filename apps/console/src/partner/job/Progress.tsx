/** Where a job stands on the way to closed (R3): received, acknowledged or booked, in progress, done, closed. */
import type { Status } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { TRACKER_LABELS, trackerSteps } from '../../lib/job-steps';
import { Notice } from '../../ui/parts';

export function Progress({ status }: { status: Status }): ReactNode {
  if (status === 'cancelled') return <Notice tone="calm">This request was cancelled.</Notice>;
  return (
    <ol className="tracker" aria-label="Progress">
      {trackerSteps(status).map(({ stage, state }) => (
        <li
          key={stage}
          className={`tracker-step tracker-${state}`}
          aria-current={state === 'current' ? 'step' : undefined}
        >
          {TRACKER_LABELS[stage]}
        </li>
      ))}
    </ol>
  );
}
