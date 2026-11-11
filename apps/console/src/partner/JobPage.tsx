/**
 * The partner office's job page (ADR 0025; R3, E4, E8, L4, A2, A3, A7): where the job stands, its facts,
 * photos and messages (with reply), and the steps the office may take now for its technicians. The steps
 * offered are the ones the API allows (detail.actions); the API checks each again (C-AZ-2).
 */
import {
  partnerTeamResponse,
  requestDetailResponse,
  type PartnerTeam,
  type RequestDetail,
} from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { apiPath } from '../lib/api';
import { STEP_LABELS, officeSteps, quoteStepLabel, type OfficeStep } from '../lib/job-steps';
import { jobWhat } from '../lib/jobs';
import { completionPhotoSlots } from '../lib/photos';
import { Messages } from '../request/Messages';
import { Photos, Summary } from '../request/Detail';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Loaded, Notice, PageHeader, Tag } from '../ui/parts';
import { CompletionPhotos } from './job/CompletionPhotos';
import { ConsultationSteps } from './job/ConsultationSteps';
import { MakeSafe, NoAccess } from './job/DoorForms';
import { Progress } from './job/Progress';
import { ProjectSection } from '../request/ProjectSection';
import { ReportSection } from './job/ReportSection';
import type { StepProps } from './job/shared';
import { Acknowledge, BookVisit, SendQuote, StartWork, WorkDone } from './job/StepForms';

function StepForm({ step, d, props }: { step: OfficeStep; d: RequestDetail; props: StepProps }): ReactNode {
  switch (step) {
    case 'acknowledge':
      return <Acknowledge {...props} />;
    case 'book_visit':
      return <BookVisit {...props} />;
    case 'send_quote':
      return <SendQuote {...props} title={quoteStepLabel(d.quote?.revision ?? null)} />;
    case 'start_work':
      return <StartWork {...props} />;
    case 'work_done':
      return <WorkDone {...props} />;
    case 'no_access':
      return <NoAccess {...props} />;
    case 'make_safe':
      return <MakeSafe {...props} />;
  }
}

function Steps({
  d,
  team,
  now,
  onChanged,
}: {
  d: RequestDetail;
  team: PartnerTeam['technicians'];
  now: number;
  onChanged: () => void;
}): ReactNode {
  const [open, setOpen] = useState<OfficeStep | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const steps = officeSteps(d.request, d.actions);
  const props: StepProps = {
    jobId: d.request.id,
    team,
    now,
    onDone: (message) => {
      setOpen(null);
      setDone(message);
      onChanged();
    },
    onCancel: () => {
      setOpen(null);
    },
  };
  return (
    <>
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      {steps.length === 0 ? null : (
        <section className="card">
          <h2 className="section-title">Next steps</h2>
          {team.length === 0 ? (
            <Notice tone="warn">Add technicians on the Team page before booking or acknowledging.</Notice>
          ) : null}
          <div className="row-actions">
            {steps.map((s) => (
              <button
                key={s}
                type="button"
                className={open === s ? 'btn' : 'btn btn-outline'}
                aria-pressed={open === s}
                onClick={() => {
                  setDone(null);
                  setOpen(open === s ? null : s);
                }}
              >
                {s === 'send_quote' ? quoteStepLabel(d.quote?.revision ?? null) : STEP_LABELS[s]}
              </button>
            ))}
          </div>
        </section>
      )}
      {open === null ? null : <StepForm key={open} step={open} d={d} props={props} />}
    </>
  );
}

/** E10: finished-work photos, once the work has started and while the job is open to this office. */
function AddPhotos({ d, onAdded }: { d: RequestDetail; onAdded: () => void }): ReactNode {
  const slots = completionPhotoSlots(d.request.status, d.canMessage, d.completionPhotos.length);
  return slots === 0 ? null : <CompletionPhotos jobId={d.request.id} slots={slots} onAdded={onAdded} />;
}

export function JobPage({ id }: { id: string }): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const { state, reload } = useLoad(
    () =>
      Promise.all([
        api.get(apiPath('requests', id), requestDetailResponse),
        api.get('/api/partner/team', partnerTeamResponse),
      ]),
    id,
  );
  return (
    <Loaded state={state} reload={reload}>
      {([d, team]) => (
        <>
          <PageHeader eyebrow={`Job ${d.request.ref}`} title={jobWhat(d.request)}>
            {d.request.emergency ? <Tag tone="bad">Emergency</Tag> : null}
          </PageHeader>
          <Progress status={d.request.status} />
          <Steps d={d} team={team.technicians} now={now} onChanged={reload} />
          <ConsultationSteps id={id} onChanged={reload} />
          <ProjectSection id={id} onChanged={reload} />
          <Summary d={d} now={now} />
          <Photos requestId={id} title="Photos from the resident" photos={d.photos} />
          <Photos requestId={id} title="Photos when the work was finished" photos={d.completionPhotos} />
          <AddPhotos d={d} onAdded={reload} />
          <ReportSection requestId={id} refText={d.request.ref} onChanged={reload} />
          <Messages d={d} editable onSent={reload} />
        </>
      )}
    </Loaded>
  );
}
