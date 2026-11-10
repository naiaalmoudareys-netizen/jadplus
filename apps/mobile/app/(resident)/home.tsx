/**
 * Home for owners and tenants (R1, R2, U6, docs/DESIGN.md): project photo, the emergency button, the next
 * payment (owners), and news & offers at the end (owners). Requests have their own tab (Naya, 10-Nov-2026).
 */
import { dubaiDate, planSummary } from '@jadplus/shared';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { myPlaces } from '../../src/api/endpoints.js';
import { aed, longDate, unitTitle } from '../../src/portal/format.js';
import { NewsSection } from '../../src/portal/NewsSection.js';
import { usePortalOptional } from '../../src/portal/PortalProvider.js';
import { DemoBadge } from '../../src/portal/ui.js';
import { useSession, useSessionController } from '../../src/session/SessionProvider.js';
import { Hero } from '../../src/ui/brand.js';
import { useLoad } from '../../src/ui/hooks.js';
import { Body, Button, Card, Page } from '../../src/ui/kit.js';
import { colors, fonts } from '../../src/ui/theme.js';

/** Owners only: next payment (or overdue). */
function OwnerSummary(): ReactNode {
  const portal = usePortalOptional();
  const router = useRouter();
  const data = portal?.data ?? null;
  if (data === null) return null;
  const today = dubaiDate(Date.now());
  const deal = data.deals[portal?.dealIndex ?? 0] ?? data.deals[0];
  if (deal === undefined) return null;
  const s = planSummary(deal.instalments, deal.price, today);
  const overdue = s.overdueAmount > 1;
  const nextDue = overdue ? null : (s.next?.instalment.due ?? null);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        router.push('/payments');
      }}
    >
      <Card>
        <Text style={styles.kpiLabel}>{overdue ? 'OVERDUE' : 'NEXT PAYMENT'}</Text>
        <Text style={[styles.kpi, overdue && styles.overdue]}>
          {overdue ? aed(s.overdueAmount) : s.next === null ? 'Nothing due' : aed(s.next.state.balance)}
        </Text>
        <Body muted>
          {unitTitle(deal)}
          {nextDue === null ? '' : ` · ${longDate(nextDue)}`}
        </Body>
      </Card>
    </Pressable>
  );
}

/** News & offers only where owner data is loaded (owners). */
function NewsIfOwner(): ReactNode {
  return usePortalOptional() === null ? null : <NewsSection />;
}

/** The demo label only exists where owner data is loaded. */
function DemoBadgeIfOwner(): ReactNode {
  return usePortalOptional() === null ? null : <DemoBadge />;
}

export default function Home(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const router = useRouter();
  const loadPlaces = useCallback(() => myPlaces(api), [api]);
  const places = useLoad(loadPlaces);
  const home = places.data?.[0]?.location ?? null;
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
      <NewsIfOwner />
    </Page>
  );
}

const styles = StyleSheet.create({
  kpiLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.muted },
  kpi: { fontFamily: fonts.light, fontSize: 26, color: colors.navy, fontVariant: ['tabular-nums'] },
  overdue: { color: colors.urgent },
});
