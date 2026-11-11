/**
 * One request as an owner or tenant sees it (R1, R2): status, the company handling it, when they arrive,
 * the journey (ADR 0018: visit, quote, "Is the work done?", rating) and the messages (ADR 0009: all contact
 * inside JAD+). Refreshes every 30 seconds until push alerts exist.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { requestDetail } from '../../src/api/endpoints.js';
import {
  arrivalLabel,
  jobTitle,
  placeLabel,
  preferredVisitLabel,
  residentStatusLabel,
} from '../../src/jobs/format.js';
import { useLang } from '../../src/i18n/I18nProvider.js';
import { RequestPhotos } from '../../src/requests/RequestPhotos.js';
import { ResidentJourney } from '../../src/requests/ResidentJourney.js';
import { useSession, useSessionController } from '../../src/session/SessionProvider.js';
import { Conversation } from '../../src/ui/Conversation.js';
import { useLoad } from '../../src/ui/hooks.js';
import { Body, Heading, Loading, Notice, Page } from '../../src/ui/kit.js';
import { PartnerName } from '../../src/ui/HelpBits.js';
import { colors, radius, space } from '../../src/ui/theme.js';

const REFRESH_MS = 30_000;

export default function RequestPage(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const lang = useLang();
  const { t } = lang;
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => requestDetail(api, id), [api, id]);
  const detail = useLoad(load, REFRESH_MS);

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if (detail.loading && detail.data === null) return <Loading />;
  if (detail.data === null) {
    return (
      <Page>
        <Notice tone="error">{detail.error ?? t('req.notFound')}</Notice>
      </Page>
    );
  }
  const { request, messages, canMessage, photos } = detail.data;
  const preferred = preferredVisitLabel(request, lang);
  const arrival = arrivalLabel(request, t);
  return (
    <Page>
      <Heading>{jobTitle(request, t)}</Heading>
      <Body muted>
        {request.ref} · {placeLabel(request.location, t)}
      </Body>
      <View style={styles.card}>
        <Body>{residentStatusLabel(request.status, t)}</Body>
        {request.partnerName === null ? null : (
          <PartnerName
            name={t('req.handledBy', { name: request.partnerName })}
            verified={request.partnerVerified}
            kind={request.partnerKind}
          />
        )}
        {arrival === null ? null : <Body>{arrival}</Body>}
        {arrival === null && preferred !== null ? <Body muted>{preferred}</Body> : null}
      </View>
      <View style={styles.card}>
        <Body>{request.description}</Body>
      </View>
      <RequestPhotos requestId={request.id} photos={photos} />
      <ResidentJourney
        detail={detail.data}
        owner={session.me.role === 'owner'}
        onChanged={() => void detail.reload()}
      />
      <Conversation
        api={api}
        requestId={request.id}
        messages={messages}
        canMessage={canMessage}
        onSent={() => void detail.reload()}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, padding: space.md, gap: space.xs },
});
