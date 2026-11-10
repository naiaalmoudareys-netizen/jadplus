/**
 * The job steps that need a form (R3; ADR 0018, 0019), each opened in a pop-up from the bottom: acknowledge a
 * new emergency (E4), book or change the visit, send a quote (L4, A2, A3), record make-safe work (E8), finish
 * the work with photos (E10) and "No one at the door" (A7). Also the names of every step and the short
 * confirmation shown once a step went through.
 */
import type { PartnerJob, RequestDetail } from '@jadplus/shared';
import type { ReactNode } from 'react';
import type { MessageKey } from '../i18n/dictionary.js';
import type { Translate } from '../i18n/lang.js';
import { useT } from '../i18n/I18nProvider.js';
import type { JobForm, JobStep } from '../partner/progress.js';
import { Acknowledge } from './Acknowledge.js';
import { BookVisit } from './BookVisit.js';
import { FinishWork } from './FinishWork.js';
import { jobTitle } from './format.js';
import { JobSheet } from './JobSheet.js';
import { MakeSafe } from './MakeSafe.js';
import { SendQuote } from './SendQuote.js';
import { NoAccess } from './VisitDay.js';

const DONE_KEYS: Readonly<Record<JobStep, MessageKey>> = {
  acknowledge: 'job.ok.acknowledge',
  book_visit: 'job.ok.book_visit',
  on_my_way: 'job.ok.on_my_way',
  start_work: 'job.ok.start_work',
  work_done: 'job.ok.work_done',
  send_quote: 'job.ok.send_quote',
  make_safe: 'job.ok.make_safe',
  no_access: 'job.ok.no_access',
};

/** "Visit booked.", "Quote sent to the owner." … once the step went through. */
export function doneText(step: JobStep, t: Translate): string {
  return t(DONE_KEYS[step]);
}

/** The step's name in the "More" list and on its pop-up ("Change the visit", "Revised quote" …). */
export function stepTitle(step: JobStep, detail: RequestDetail | null, t: Translate): string {
  switch (step) {
    case 'acknowledge':
      return t('access.acknowledge');
    case 'book_visit':
      return t((detail?.visit ?? null) === null ? 'journey.book.title' : 'journey.book.change');
    case 'send_quote':
      return t(detail?.quote?.status === 'declined' ? 'journey.quote.revised' : 'journey.quote.add');
    case 'make_safe':
      return t('extras.makeSafe.open');
    case 'no_access':
      return t('extras.noAccess.open');
    case 'work_done':
      return t('journey.work.finish');
    case 'on_my_way':
      return t('extras.onMyWay');
    case 'start_work':
      return t('journey.work.start');
  }
}

export function JobForms(props: {
  form: JobForm;
  job: PartnerJob;
  detail: RequestDetail | null;
  onClose: () => void;
  /** Make-safe refused by the API (no limit, or above it): move straight on to a quote. */
  onSwitch: (form: JobForm) => void;
  onDone: (step: JobForm) => void;
}): ReactNode {
  const t = useT();
  const { form, job, detail } = props;
  const done = () => {
    props.onDone(form);
  };
  const body = (): ReactNode => {
    switch (form) {
      case 'acknowledge':
        return <Acknowledge job={job} onDone={done} />;
      case 'book_visit':
        return <BookVisit jobId={job.id} preferred={job.preferredVisit} onDone={done} />;
      case 'send_quote':
        return <SendQuote jobId={job.id} revised={detail?.quote?.status === 'declined'} onDone={done} />;
      case 'make_safe':
        return (
          <MakeSafe
            jobId={job.id}
            onQuote={
              detail?.actions.includes('send_quote') === true
                ? () => {
                    props.onSwitch('send_quote');
                  }
                : null
            }
            onDone={done}
          />
        );
      case 'work_done':
        return <FinishWork jobId={job.id} photosSent={detail?.completionPhotos.length ?? 0} onDone={done} />;
      case 'no_access':
        return <NoAccess jobId={job.id} onDone={done} />;
    }
  };
  return (
    <JobSheet
      title={stepTitle(form, detail, t)}
      subtitle={`${jobTitle(job, t)} · ${job.ref}`}
      onClose={props.onClose}
    >
      {body()}
    </JobSheet>
  );
}
