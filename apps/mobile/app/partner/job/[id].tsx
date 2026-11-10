/**
 * One job (R3) and, for a new emergency, acknowledging it (E4): who is going and when they will arrive.
 * Only this partner's active technicians can be chosen (E17); the window choices always satisfy the rules
 * the API applies (packages/shared arrivalChoices / arrivalWindowAllowed).
 */
import { arrivalChoices, type PartnerJob } from '@jadplus/shared';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../../src/api/client.js';
import { acknowledge, partnerJobs, partnerTeam, requestDetail } from '../../../src/api/endpoints.js';
import {
  arrivalLabel,
  dueLabel,
  isOverdue,
  jobTitle,
  needsAcknowledgement,
  placeLabel,
  statusLabel,
} from '../../../src/jobs/format.js';
import { useSession, useSessionController } from '../../../src/session/SessionProvider.js';
import { Conversation } from '../../../src/ui/Conversation.js';
import { useLoad, useNow } from '../../../src/ui/hooks.js';
import { Body, Button, Heading, Loading, Notice, Page } from '../../../src/ui/kit.js';
import { colors, fonts, radius, space } from '../../../src/ui/theme.js';

function Choice(props: { label: string; selected: boolean; onPress: () => void }): ReactNode {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={[styles.choice, props.selected && styles.chosen]}
    >
      <Text style={[styles.choiceText, props.selected && styles.chosenText]}>{props.label}</Text>
    </Pressable>
  );
}

function Acknowledge({ job }: { job: PartnerJob }): ReactNode {
  const { api } = useSessionController();
  const router = useRouter();
  const loadTeam = useCallback(() => partnerTeam(api), [api]);
  const team = useLoad(loadTeam);
  const [chosenTech, setChosenTech] = useState<string | null>(null);
  const [windowIndex, setWindowIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const technicians = team.data?.technicians ?? [];
  const technicianId = chosenTech ?? technicians.find((t) => t.self)?.id ?? technicians[0]?.id ?? null;

  const submit = async () => {
    if (technicianId === null) return;
    // Windows are worked out at the moment of sending, so they are never in the past.
    const window = arrivalChoices(Date.now())[windowIndex];
    if (window === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await acknowledge(api, job.id, {
        technicianId,
        arrivalWindowStart: window.start,
        arrivalWindowEnd: window.end,
      });
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (team.loading && team.data === null) return <Loading />;
  return (
    <View style={styles.section}>
      <Heading>Acknowledge</Heading>
      <Body>Who is going?</Body>
      {technicians.map((t) => (
        <Choice
          key={t.id}
          label={t.self ? `${t.name} (me)` : t.name}
          selected={t.id === technicianId}
          onPress={() => {
            setChosenTech(t.id);
          }}
        />
      ))}
      {technicians.length === 0 ? <Notice tone="error">No active technician on your team.</Notice> : null}
      <Body>When will they arrive?</Body>
      {arrivalChoices(Date.now()).map((w, i) => (
        <Choice
          key={w.label}
          label={w.label}
          selected={i === windowIndex}
          onPress={() => {
            setWindowIndex(i);
          }}
        />
      ))}
      <Button
        title="Acknowledge"
        busy={busy}
        disabled={technicianId === null}
        onPress={() => void submit()}
      />
      {error === null ? null : <Notice tone="error">{error}</Notice>}
      {team.error === null ? null : <Notice tone="error">{team.error}</Notice>}
    </View>
  );
}

export default function Job(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow();
  const load = useCallback(async () => (await partnerJobs(api)).find((j) => j.id === id) ?? null, [api, id]);
  const job = useLoad(load);
  // Messages with the resident and JAD+ (ADR 0009); refreshed every 30 seconds until push alerts exist.
  const loadDetail = useCallback(() => requestDetail(api, id), [api, id]);
  const detail = useLoad(loadDetail, 30_000);

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if (job.loading && job.data === null) return <Loading />;
  if (job.data === null) {
    return (
      <Page>
        <Notice tone="error">{job.error ?? 'This job is no longer in your queue.'}</Notice>
      </Page>
    );
  }
  const j = job.data;
  const due = dueLabel(j, now);
  const arrival = arrivalLabel(j);
  return (
    <Page>
      <Heading>{jobTitle(j)}</Heading>
      <Body muted>
        {j.ref} · {statusLabel(j.status)}
      </Body>
      {due === null ? null : (
        <Text style={[styles.due, isOverdue(j, now) && styles.urgent]} accessibilityLiveRegion="polite">
          {due}
        </Text>
      )}
      {arrival === null ? null : <Body>{arrival}</Body>}
      <View style={styles.card}>
        <Body>{placeLabel(j.location)}</Body>
        {j.location?.address ? <Body muted>{j.location.address}</Body> : null}
      </View>
      <View style={styles.card}>
        <Body>{j.description}</Body>
      </View>
      {needsAcknowledgement(j) ? <Acknowledge job={j} /> : null}
      {detail.data === null ? null : (
        <Conversation
          api={api}
          requestId={j.id}
          messages={detail.data.messages}
          canMessage={detail.data.canMessage}
          onSent={() => void detail.reload()}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, marginTop: space.md },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: space.md, gap: space.xs },
  due: { fontSize: 20, fontFamily: fonts.semibold, color: colors.text },
  urgent: { color: colors.urgent },
  choice: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  chosen: { borderColor: colors.slate, borderWidth: 2 },
  choiceText: { fontSize: 18, fontFamily: fonts.regular, color: colors.text },
  chosenText: { fontFamily: fonts.semibold, color: colors.navy },
});
