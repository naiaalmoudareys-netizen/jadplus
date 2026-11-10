/**
 * The partner's part of the request journey (ADR 0018, 0019): the booked visit and where it stands, urgent
 * make-safe work, the latest quote, the finished-work photos, and the steps the API allows now (`actions`):
 * "I'm on my way", book the visit, make safe (emergencies), send a quote, start, mark done, and "No one at the
 * door". Steps open on demand, except a first booking, which is the next step.
 */
import type { RequestDetail } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../i18n/I18nProvider.js';
import { MakeSafeCard, QuoteCard, VisitCard } from '../requests/JourneyCards.js';
import { RequestPhotos } from '../requests/RequestPhotos.js';
import { Button, Heading } from '../ui/kit.js';
import { space } from '../ui/theme.js';
import { BookVisit } from './BookVisit.js';
import { FinishWork } from './FinishWork.js';
import { MakeSafe } from './MakeSafe.js';
import { SendQuote } from './SendQuote.js';
import { NoAccess, OnMyWay } from './VisitDay.js';

function Step(props: {
  title: string;
  open: boolean;
  onOpen: () => void;
  /** Closes the step again; left out when the step is the one thing to do next. */
  onClose?: () => void;
  children: ReactNode;
}): ReactNode {
  const t = useT();
  if (!props.open) return <Button title={props.title} kind="secondary" onPress={props.onOpen} />;
  return (
    <View style={styles.step}>
      <Heading>{props.title}</Heading>
      {props.children}
      {props.onClose === undefined ? null : (
        <Button title={t('extras.back')} kind="secondary" onPress={props.onClose} />
      )}
    </View>
  );
}

type Opened = 'visit' | 'quote' | 'safe' | 'door' | null;

export function JobJourney({
  detail,
  onChanged,
}: {
  detail: RequestDetail;
  onChanged: () => void;
}): ReactNode {
  const t = useT();
  const [opened, setOpened] = useState<Opened>(null);
  const { request, visit, quote, actions, makeSafe } = detail;
  const revised = quote?.status === 'declined';
  const done = () => {
    setOpened(null);
    onChanged();
  };
  const open = (step: Opened) => () => {
    setOpened(step);
  };
  const close = () => {
    setOpened(null);
  };
  return (
    <View style={styles.box}>
      {visit === null ? null : <VisitCard visit={visit} viewer="partner" />}
      {makeSafe === null ? null : (
        <MakeSafeCard makeSafe={makeSafe} title={t('extras.makeSafe.recordPartner')} />
      )}
      {quote === null ? null : <QuoteCard quote={quote} />}
      {actions.includes('on_my_way') ? <OnMyWay jobId={request.id} onDone={onChanged} /> : null}
      {actions.includes('book_visit') ? (
        <Step
          title={visit === null ? t('journey.book.title') : t('journey.book.change')}
          open={opened === 'visit' || visit === null}
          onOpen={open('visit')}
          {...(visit === null ? {} : { onClose: close })}
        >
          <BookVisit jobId={request.id} preferred={request.preferredVisit} onDone={done} />
        </Step>
      ) : null}
      {actions.includes('make_safe') ? (
        <Step
          title={t('extras.makeSafe.open')}
          open={opened === 'safe'}
          onOpen={open('safe')}
          onClose={close}
        >
          <MakeSafe
            jobId={request.id}
            onQuote={actions.includes('send_quote') ? open('quote') : null}
            onDone={done}
          />
        </Step>
      ) : null}
      {actions.includes('send_quote') ? (
        <Step
          title={revised ? t('journey.quote.revised') : t('journey.quote.add')}
          open={opened === 'quote'}
          onOpen={open('quote')}
          onClose={close}
        >
          <SendQuote jobId={request.id} revised={revised} onDone={done} />
        </Step>
      ) : null}
      <FinishWork
        jobId={request.id}
        actions={actions}
        photosSent={detail.completionPhotos.length}
        onDone={done}
      />
      {actions.includes('no_access') ? (
        <Step
          title={t('extras.noAccess.open')}
          open={opened === 'door'}
          onOpen={open('door')}
          onClose={close}
        >
          <NoAccess jobId={request.id} onDone={done} />
        </Step>
      ) : null}
      <RequestPhotos
        requestId={request.id}
        photos={detail.completionPhotos}
        title={t('journey.done.photos')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.md },
  step: { gap: space.sm, marginTop: space.sm },
});
