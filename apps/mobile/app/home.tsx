/**
 * Home for owners and tenants (R1, R2, U6): the emergency button first, then their requests with status.
 * Routine requests, approvals and payments come in phase B.
 */
import { Link, Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RequestSummary } from '@jadplus/shared';
import { myRequests } from '../src/api/endpoints.js';
import { arrivalLabel, jobTitle, placeLabel, residentStatusLabel } from '../src/jobs/format.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { useLoad } from '../src/ui/hooks.js';
import { Body, Button, Heading, Notice, Page } from '../src/ui/kit.js';
import { colors, radius, space } from '../src/ui/theme.js';

const REFRESH_MS = 30_000;

function RequestRow({ r, onPress }: { r: RequestSummary; onPress: () => void }): ReactNode {
  const arrival = arrivalLabel(r);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.title}>{jobTitle(r)}</Text>
        <Text style={styles.ref}>{r.ref}</Text>
      </View>
      <Text style={styles.status}>{residentStatusLabel(r.status)}</Text>
      {arrival === null ? null : <Text style={styles.status}>{arrival}</Text>}
      <Text style={styles.place}>{placeLabel(r.location)}</Text>
    </Pressable>
  );
}

export default function Home(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const router = useRouter();
  const load = useCallback(() => myRequests(api), [api]);
  const requests = useLoad(load, REFRESH_MS);
  const { reload } = requests;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  return (
    <Page>
      <Button
        title="Report an emergency"
        kind="danger"
        onPress={() => {
          router.push('/emergency');
        }}
      />
      <Heading>My requests</Heading>
      {requests.error === null ? null : <Notice tone="error">{requests.error}</Notice>}
      {requests.data !== null && requests.data.length === 0 ? <Body muted>No requests yet.</Body> : null}
      {(requests.data ?? []).map((r) => (
        <RequestRow
          key={r.id}
          r={r}
          onPress={() => {
            router.push({ pathname: '/request/[id]', params: { id: r.id } });
          }}
        />
      ))}
      <Link href="/settings" style={styles.link}>
        Account and sign out
      </Link>
    </Page>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.md,
    gap: space.xs,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.7 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 19, fontWeight: '600', color: colors.text },
  ref: { fontSize: 15, color: colors.muted },
  status: { fontSize: 16, color: colors.text },
  place: { fontSize: 15, color: colors.muted },
  link: { fontSize: 17, color: colors.navy, textDecorationLine: 'underline', marginTop: space.md },
});
