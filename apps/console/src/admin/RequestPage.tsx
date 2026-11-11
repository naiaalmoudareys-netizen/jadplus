/**
 * One request, for JAD+ Admin (ADR 0023, 0025): summary, photos, messages with a reply, the timeline, internal
 * notes (with "owner called", A1) and JAD+'s actions: move to another partner, reclassify, cancel. A viewer
 * reads everything and changes nothing (C-AZ-1; the API refuses anyway).
 */
import { requestDetailResponse } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { apiPath } from '../lib/api';
import { jobWhat } from '../lib/jobs';
import { canChange } from '../lib/session';
import { Photos, Summary } from '../request/Detail';
import { ConsultationView } from '../request/ConsultationView';
import { Messages } from '../request/Messages';
import { ProjectSection } from '../request/ProjectSection';
import { ReportView } from '../request/ReportView';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Loaded, PageHeader, Tag } from '../ui/parts';
import { RequestActions } from './request/Actions';
import { Notes } from './request/Notes';
import { Timeline } from './request/Timeline';

export function RequestPage({ id }: { id: string }): ReactNode {
  const { api, session } = useConsole();
  const editable = canChange(session.role);
  const now = useNow();
  // Bumped after a change, so the timeline and notes load again with it.
  const [round, setRound] = useState(0);
  const { state, reload } = useLoad(() => api.get(apiPath('requests', id), requestDetailResponse), id);
  const changed = (): void => {
    reload();
    setRound((r) => r + 1);
  };
  return (
    <Loaded state={state} reload={reload}>
      {(d) => (
        <>
          <PageHeader eyebrow={`Request ${d.request.ref}`} title={jobWhat(d.request)}>
            {d.request.emergency ? <Tag tone="bad">Emergency</Tag> : null}
          </PageHeader>
          <Summary d={d} now={now} />
          {editable ? <RequestActions d={d} onChanged={changed} /> : null}
          <Photos requestId={id} title="Photos from the resident" photos={d.photos} />
          <Photos requestId={id} title="Photos when the work was finished" photos={d.completionPhotos} />
          <ReportView requestId={id} refText={d.request.ref} />
          <ConsultationView requestId={id} />
          <ProjectSection id={id} onChanged={reload} />
          <div className="columns">
            <Messages d={d} editable={editable} onSent={changed} />
            <Notes id={id} round={round} editable={editable} />
          </div>
          <Timeline id={id} round={round} />
        </>
      )}
    </Loaded>
  );
}
