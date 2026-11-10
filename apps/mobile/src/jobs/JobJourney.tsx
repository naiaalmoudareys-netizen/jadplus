/**
 * The partner's part of the request journey (ADR 0018): the booked visit, the latest quote, the finished-work
 * photos, and the steps the API allows now (`actions`): book the visit, send a quote, start, mark done.
 * Booking and quoting open on demand, except a first booking, which is the next step.
 */
import type { RequestDetail } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../i18n/I18nProvider.js';
import { QuoteCard, VisitCard } from '../requests/JourneyCards.js';
import { RequestPhotos } from '../requests/RequestPhotos.js';
import { Button, Heading } from '../ui/kit.js';
import { space } from '../ui/theme.js';
import { BookVisit } from './BookVisit.js';
import { FinishWork } from './FinishWork.js';
import { SendQuote } from './SendQuote.js';

function Step(props: { title: string; open: boolean; onOpen: () => void; children: ReactNode }): ReactNode {
  if (!props.open) return <Button title={props.title} kind="secondary" onPress={props.onOpen} />;
  return (
    <View style={styles.step}>
      <Heading>{props.title}</Heading>
      {props.children}
    </View>
  );
}

export function JobJourney({
  detail,
  onChanged,
}: {
  detail: RequestDetail;
  onChanged: () => void;
}): ReactNode {
  const t = useT();
  const [opened, setOpened] = useState<'visit' | 'quote' | null>(null);
  const { request, visit, quote, actions } = detail;
  const revised = quote?.status === 'declined';
  const done = () => {
    setOpened(null);
    onChanged();
  };
  return (
    <View style={styles.box}>
      {visit === null ? null : <VisitCard visit={visit} />}
      {quote === null ? null : <QuoteCard quote={quote} />}
      {actions.includes('book_visit') ? (
        <Step
          title={visit === null ? t('journey.book.title') : t('journey.book.change')}
          open={opened === 'visit' || visit === null}
          onOpen={() => {
            setOpened('visit');
          }}
        >
          <BookVisit jobId={request.id} preferred={request.preferredVisit} onDone={done} />
        </Step>
      ) : null}
      {actions.includes('send_quote') ? (
        <Step
          title={revised ? t('journey.quote.revised') : t('journey.quote.add')}
          open={opened === 'quote'}
          onOpen={() => {
            setOpened('quote');
          }}
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
