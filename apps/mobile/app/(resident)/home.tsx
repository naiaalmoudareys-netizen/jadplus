/**
 * Home for owners and tenants (R1, R2, U6, docs/DESIGN.md): project photo, the emergency button, then for
 * owners the next payment and the latest news (3) with the offer count, and everyone's requests with status.
 * Routine requests and approvals come in phase B.
 */
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dubaiDate, newsFeed, offerCount, planSummary, type RequestSummary } from '@jadplus/shared';
import { myPlaces, myRequests } from '../../src/api/endpoints.js';
import { arrivalLabel, jobTitle, placeLabel, residentStatusLabel } from '../../src/jobs/format.js';
import { aed, longDate, unitTitle } from '../../src/portal/format.js';
import { usePortalOptional } from '../../src/portal/PortalProvider.js';
import { DemoBadge } from '../../src/portal/ui.js';
import { useSession, useSessionController } from '../../src/session/SessionProvider.js';
import { Hero } from '../../src/ui/brand.js';
import { useLoad } from '../../src/ui/hooks.js';
import { Body, Button, Card, Heading, Notice, Page } from '../../src/ui/kit.js';
import { colors, fonts, radius, space } from '../../src/ui/theme.js';

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

/** Owners only: next payment (or overdue) and the latest news with the offer count. */
function OwnerSummary(): ReactNode {
  const portal = usePortalOptional();
  const router = useRouter();
  const data = portal?.data ?? null;
  if (data === null) return null;
  const today = dubaiDate(Date.now());
  const deal = data.deals[portal?.dealIndex ?? 0] ?? data.deals[0];
  const s = deal === undefined ? null : planSummary(deal.instalments, deal.price, today);
  const latest = newsFeed(data.posts, 'all', today).slice(0, 3);
  const offers = offerCount(data.posts, today);
  const nextDue = s === null || s.overdueAmount > 1 ? null : (s.next?.instalment.due ?? null);
  return (
    <>
      {deal === undefined || s === null ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            router.push('/payments');
          }}
        >
          <Card>
            <Text style={styles.kpiLabel}>{s.overdueAmount > 1 ? 'OVERDUE' : 'NEXT PAYMENT'}</Text>
            <Text style={[styles.kpi, s.overdueAmount > 1 && styles.overdue]}>
              {s.overdueAmount > 1
                ? aed(s.overdueAmount)
                : s.next === null
                  ? 'Nothing due'
                  : aed(s.next.state.balance)}
            </Text>
            <Body muted>
              {unitTitle(deal)}
              {nextDue === null ? '' : ` · ${longDate(nextDue)}`}
            </Body>
          </Card>
        </Pressable>
      )}
      {latest.length === 0 ? null : (
        <>
          <Heading>
            {offers > 0 ? `News · ${String(offers)} owners' offer${offers === 1 ? '' : 's'}` : 'News'}
          </Heading>
          {latest.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => {
                router.push('/news');
              }}
            >
              <Card>
                <Text style={styles.title}>{p.title}</Text>
                <Body muted>{longDate(p.date)}</Body>
              </Card>
            </Pressable>
          ))}
        </>
      )}
    </>
  );
}

/** The demo label only exists where owner data is loaded. */
function DemoBadgeIfOwner(): ReactNode {
  return usePortalOptional() === null ? null : <DemoBadge />;
}

export default function Home(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const router = useRouter();
  const load = useCallback(() => myRequests(api), [api]);
  const requests = useLoad(load, REFRESH_MS);
  const loadPlaces = useCallback(() => myPlaces(api), [api]);
  const places = useLoad(loadPlaces);
  const home = places.data?.[0]?.location ?? null;
  const { reload } = requests;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  return (
    <Page>
      <DemoBadgeIfOwner />
      <Hero
        project={home?.project ?? null}
        eyebrow={home?.project ?? 'JAD Global'}
        title={home === null ? 'Welcome' : home.unitName}
      />
      <Button
        title="Report an emergency"
        kind="danger"
        onPress={() => {
          router.push('/emergency');
        }}
      />
      <OwnerSummary />
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
  title: { fontSize: 19, fontFamily: fonts.semibold, color: colors.text },
  ref: { fontSize: 15, fontFamily: fonts.regular, color: colors.muted },
  status: { fontSize: 16, fontFamily: fonts.regular, color: colors.text },
  place: { fontSize: 15, fontFamily: fonts.regular, color: colors.muted },
  kpiLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.muted },
  kpi: { fontFamily: fonts.light, fontSize: 26, color: colors.navy, fontVariant: ['tabular-nums'] },
  overdue: { color: colors.urgent },
});
