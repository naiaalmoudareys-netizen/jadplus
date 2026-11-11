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
import { ReportCard } from '../../src/requests/ReportCard.js';
import { ProjectCard } from '../../src/requests/ProjectCard.js';
import { hasProjectSide } from '../../src/managed/logic.js';
import { RequestPhotos } from '../../src/requests/RequestPhotos.js';
import { ResidentJourney } from '../../src/requests/ResidentJourney.js';
import { consultationOf } from '../../src/api/consultation.js';
import { ConsultationJourney } from '../../src/requests/ConsultationJourney.js';
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
  // ADR 0031: a consultation shows its stages instead of the visit journey (null for any other request).
  const loadConsultation = useCallback(() => consultationOf(api, id), [api, id]);
  const consultation = useLoad(loadConsultation, REFRESH_MS);

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
      {/* ADR 0034: furnishing delivery date and interior design stages (owners only). */}
      {session.me.role === 'owner' && hasProjectSide(request.serviceName) ? (
        <ProjectCard requestId={request.id} />
      ) : null}
      {session.me.role === 'owner' ? (
        <ReportCard requestId={request.id} onChanged={() => void detail.reload()} />
      ) : null}
      {consultation.data === null ? (
        consultation.loading ? null : (
          <ResidentJourney
            detail={detail.data}
            owner={session.me.role === 'owner'}
            onChanged={() => void detail.reload()}
          />
        )
      ) : (
        <ConsultationJourney
          detail={detail.data}
          consultation={consultation.data}
          onChanged={() => {
            void detail.reload();
            void consultation.reload();
          }}
        />
      )}
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
