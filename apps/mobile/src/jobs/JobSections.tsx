/**
 * The folded middle of a technician's job (R3), closed by default and one open at a time: the problem
 * (description and the resident's photos, ADR 0013), the messages (ADR 0009), the latest quote and the
 * make-safe record (L4, E8) when there is one, and the finished-work photos (E10) once added.
 */
import type { PartnerJob, RequestDetail } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { useLang } from '../i18n/I18nProvider.js';
import { aed } from '../portal/format.js';
import { MakeSafeCard, QuoteCard } from '../requests/JourneyCards.js';
import { RequestPhotos } from '../requests/RequestPhotos.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Conversation } from '../ui/Conversation.js';
import { Body } from '../ui/kit.js';
import { Fold } from './Fold.js';
import { quoteStatusLabel } from './journey.js';

type Section = 'problem' | 'messages' | 'quote' | 'finished';

export function JobSections(props: {
  job: PartnerJob;
  detail: RequestDetail | null;
  onMessageSent: () => void;
}): ReactNode {
  const { t, locale } = useLang();
  const { api } = useSessionController();
  const [open, setOpen] = useState<Section | null>(null);
  const { job, detail } = props;
  const toggle = (section: Section) => () => {
    setOpen((o) => (o === section ? null : section));
  };
  const photos = detail?.photos ?? [];
  const quote = detail?.quote ?? null;
  const makeSafe = detail?.makeSafe ?? null;
  const finished = detail?.completionPhotos ?? [];
  const quoteLine =
    quote === null ? null : `${aed(quote.amountAed, locale)} · ${quoteStatusLabel(quote.status, t)}`;
  return (
    <>
      <Fold
        title={t('job.page.problem')}
        detail={photos.length === 0 ? null : t('job.page.photos', { count: photos.length })}
        open={open === 'problem'}
        onToggle={toggle('problem')}
      >
        <Body>{job.description}</Body>
        <RequestPhotos requestId={job.id} photos={photos} />
      </Fold>
      {detail === null ? null : (
        <Fold
          title={t('job.page.messages', { count: detail.messages.length })}
          open={open === 'messages'}
          onToggle={toggle('messages')}
        >
          <Conversation
            api={api}
            requestId={job.id}
            messages={detail.messages}
            canMessage={detail.canMessage}
            onSent={props.onMessageSent}
            bare
          />
        </Fold>
      )}
      {quote === null && makeSafe === null ? null : (
        <Fold
          title={job.emergency ? t('job.page.quoteSafe') : t('journey.quote.title')}
          detail={quoteLine}
          open={open === 'quote'}
          onToggle={toggle('quote')}
        >
          {makeSafe === null ? null : (
            <MakeSafeCard makeSafe={makeSafe} title={t('extras.makeSafe.recordPartner')} />
          )}
          {quote === null ? null : <QuoteCard quote={quote} />}
        </Fold>
      )}
      {finished.length === 0 ? null : (
        <Fold
          title={t('job.page.finished', { count: finished.length })}
          open={open === 'finished'}
          onToggle={toggle('finished')}
        >
          <RequestPhotos requestId={job.id} photos={finished} title={t('journey.done.photos')} />
        </Fold>
      )}
    </>
  );
}
