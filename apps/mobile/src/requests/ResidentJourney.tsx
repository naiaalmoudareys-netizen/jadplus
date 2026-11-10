/**
 * The journey on the resident's request page (ADR 0018, 0019): the booked visit and where it stands
 * ("Technician on the way"), urgent make-safe work within the owner's limit (E8), the quote (the owner
 * decides; a tenant is told the owner decides), "Is the work done?", the finished-work photos, the rating, and
 * cancelling or "I arranged it myself" (E19). Every button comes from `actions`, what the API allows now.
 */
import type { RequestDetail } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../i18n/I18nProvider.js';
import { Body } from '../ui/kit.js';
import { space } from '../ui/theme.js';
import { CloseRequest } from './CloseRequest.js';
import { MakeSafeCard, QuoteCard, VisitCard } from './JourneyCards.js';
import { GivenRating, RateRequest } from './Rating.js';
import { RequestPhotos } from './RequestPhotos.js';
import { ConfirmWork, QuoteDecision } from './ResidentSteps.js';

export function ResidentJourney(props: {
  detail: RequestDetail;
  owner: boolean;
  onChanged: () => void;
}): ReactNode {
  const t = useT();
  const { request, visit, quote, actions, rating, makeSafe } = props.detail;
  const deciding = quote !== null && actions.includes('approve_quote');
  return (
    <View style={styles.box}>
      {visit === null ? null : <VisitCard visit={visit} viewer="resident" />}
      {makeSafe === null ? null : (
        <MakeSafeCard
          makeSafe={makeSafe}
          title={t(props.owner ? 'extras.makeSafe.recordOwner' : 'extras.makeSafe.recordTenant')}
        />
      )}
      {quote === null ? null : (
        <QuoteCard quote={quote}>
          {deciding ? <QuoteDecision requestId={request.id} quote={quote} onDone={props.onChanged} /> : null}
          {quote.status === 'pending' && !props.owner ? (
            <Body muted>{t('journey.quote.tenantNote')}</Body>
          ) : null}
        </QuoteCard>
      )}
      {actions.includes('confirm_done') ? (
        <ConfirmWork requestId={request.id} onDone={props.onChanged} />
      ) : null}
      <RequestPhotos
        requestId={request.id}
        photos={props.detail.completionPhotos}
        title={t('journey.done.photos')}
      />
      {actions.includes('rate') ? <RateRequest requestId={request.id} onDone={props.onChanged} /> : null}
      {rating === null ? null : <GivenRating rating={rating} />}
      <CloseRequest requestId={request.id} actions={actions} onDone={props.onChanged} />
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.md } });
