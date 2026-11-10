/**
 * One request as an owner or tenant sees it (R1, R2): status, the company handling it, when they arrive, and
 * the messages (ADR 0009: all contact inside JAD+). Refreshes every 30 seconds until push alerts exist.
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
import { RequestPhotos } from '../../src/requests/RequestPhotos.js';
import { useSession, useSessionController } from '../../src/session/SessionProvider.js';
import { Conversation } from '../../src/ui/Conversation.js';
import { useLoad } from '../../src/ui/hooks.js';
import { Body, Heading, Loading, Notice, Page } from '../../src/ui/kit.js';
import { colors, radius, space } from '../../src/ui/theme.js';

const REFRESH_MS = 30_000;

export default function RequestPage(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => requestDetail(api, id), [api, id]);
  const detail = useLoad(load, REFRESH_MS);

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if (detail.loading && detail.data === null) return <Loading />;
  if (detail.data === null) {
    return (
      <Page>
        <Notice tone="error">{detail.error ?? 'This request could not be found.'}</Notice>
      </Page>
    );
  }
  const { request, messages, canMessage, photos } = detail.data;
  const preferred = preferredVisitLabel(request);
  const arrival = arrivalLabel(request);
  return (
    <Page>
      <Heading>{jobTitle(request)}</Heading>
      <Body muted>
        {request.ref} · {placeLabel(request.location)}
      </Body>
      <View style={styles.card}>
        <Body>{residentStatusLabel(request.status)}</Body>
        {request.partnerName === null ? null : <Body muted>Handled by {request.partnerName}</Body>}
        {arrival === null ? null : <Body>{arrival}</Body>}
        {arrival === null && preferred !== null ? <Body muted>{preferred}</Body> : null}
      </View>
      <View style={styles.card}>
        <Body>{request.description}</Body>
      </View>
      <RequestPhotos requestId={request.id} photos={photos} />
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
