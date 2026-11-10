/**
 * Home (ADR 0014; Naya, 10-Nov-2026: "redesign the home page"). It answers "is everything fine with my home,
 * and is there anything I need to do?": a greeting on the project photo, what needs attention now (only when
 * something does), one-tap shortcuts, the next payment, the two requests that matter most, construction
 * progress, and news & offers to swipe through. Everything else is one tap away in the tabs.
 */
import { dubaiDate, planSummary, type RequestSummary } from '@jadplus/shared';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { myPlaces, myRequests } from '../../src/api/endpoints.js';
import {
  attentionItems,
  greeting,
  openCount,
  topRequests,
  type AttentionItem,
} from '../../src/home/attention.js';
import {
  Attention,
  ConstructionLine,
  NewsCarousel,
  SectionTitle,
  Shortcuts,
  type Shortcut,
} from '../../src/home/HomeParts.js';
import { useLang } from '../../src/i18n/I18nProvider.js';
import { arrivalLabel, jobTitle } from '../../src/jobs/format.js';
import { aed, longDate, unitTitle } from '../../src/portal/format.js';
import { usePortalOptional } from '../../src/portal/PortalProvider.js';
import { DemoBadge, ProgressBar } from '../../src/portal/ui.js';
import { projectKey } from '../../src/brand/projects.js';
import { RequestRow } from '../../src/requests/RequestRow.js';
import { useSession, useSessionController } from '../../src/session/SessionProvider.js';
import { Hero } from '../../src/ui/brand.js';
import { scrollParams } from '../../src/ui/scrollTarget.js';
import { useLoad } from '../../src/ui/hooks.js';
import { Body, Card, Page } from '../../src/ui/kit.js';
import { colors, fonts, space } from '../../src/ui/theme.js';

const REFRESH_MS = 30_000;

export default function Home(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const router = useRouter();
  const { t, locale } = useLang();
  const portal = usePortalOptional();
  const loadPlaces = useCallback(() => myPlaces(api), [api]);
  const places = useLoad(loadPlaces);
  const loadRequests = useCallback(() => myRequests(api), [api]);
  const requests = useLoad(loadRequests, REFRESH_MS);
  const { reload } = requests;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  if (session.status !== 'signed_in') return <Redirect href="/" />;

  const now = Date.now();
  const owner = session.me.role === 'owner';
  const data = portal?.data ?? null;
  const home = places.data?.[0]?.location ?? null;
  const deal = data?.deals[portal?.dealIndex ?? 0] ?? data?.deals[0];
  const plan = deal === undefined ? null : planSummary(deal.instalments, deal.price, dubaiDate(now));
  const overdue = plan !== null && plan.overdueAmount > 1;
  const nextDue = plan === null || overdue ? null : (plan.next?.instalment.due ?? null);
  const all: RequestSummary[] = requests.data ?? [];
  const project = deal?.unit?.project ?? home?.project ?? null;
  const latestUpdate =
    data?.updates.find(
      (u) => projectKey(u.project) !== null && projectKey(u.project) === projectKey(project),
    ) ?? null;

  const attention = attentionItems({
    requests: all,
    overdue: overdue ? { amount: aed(plan.overdueAmount, locale) } : null,
    now,
    t,
    label: (r) => jobTitle(r, t),
    arrival: (r) => arrivalLabel(r, t),
  });
  // Tabs remember where they were scrolled; links from Home say where to land (scrollTarget.ts).
  const openPayments = () => {
    router.push({ pathname: '/payments', params: scrollParams('top', Date.now()) });
  };
  const openItem = (item: AttentionItem) => {
    if ('tab' in item.target) openPayments();
    else router.push({ pathname: '/request/[id]', params: { id: item.target.requestId } });
  };

  const shortcuts: Shortcut[] = [
    {
      label: t('owner.home.emergency'),
      icon: 'warning-outline',
      urgent: true,
      onPress: () => {
        router.push('/emergency');
      },
    },
    ...(owner
      ? [
          {
            label: t('owner.home.request'),
            icon: 'add-circle-outline' as const,
            onPress: () => {
              router.push('/new-request');
            },
          },
          {
            label: t('owner.home.pay'),
            icon: 'card-outline' as const,
            onPress: () => {
              openPayments();
            },
          },
          {
            label: t('owner.documents'),
            icon: 'document-text-outline' as const,
            onPress: () => {
              router.push({ pathname: '/unit', params: scrollParams('documents', Date.now()) });
            },
          },
        ]
      : [
          {
            label: t('tab.requests'),
            icon: 'list-outline' as const,
            onPress: () => {
              router.push('/requests');
            },
          },
        ]),
  ];

  const name = data?.person.firstName ?? null;
  const top = topRequests(all);
  const open = openCount(all);
  return (
    <Page>
      {portal === null ? null : <DemoBadge />}
      <Hero
        project={project}
        eyebrow={deal === undefined ? (home?.project ?? 'JAD Global') : unitTitle(deal, t)}
        title={
          name === null
            ? greeting(now, t)
            : t('owner.home.greetingName', { greeting: greeting(now, t), name })
        }
      />
      <Attention items={attention} onPress={openItem} />
      <Shortcuts items={shortcuts} />

      {plan === null || deal === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            openPayments();
          }}
        >
          <Card>
            <Text style={styles.label}>
              {t(overdue ? 'owner.home.overdue' : 'owner.nextPayment').toUpperCase()}
            </Text>
            <Text style={[styles.amount, overdue && styles.urgent]}>
              {overdue
                ? aed(plan.overdueAmount, locale)
                : plan.next === null
                  ? t('owner.home.nothingDue')
                  : aed(plan.next.state.balance, locale)}
            </Text>
            {nextDue === null ? null : (
              <Body muted>{t('owner.due', { date: longDate(nextDue, locale) })}</Body>
            )}
            <ProgressBar percent={plan.percentPaid} />
            <Text style={styles.small}>
              {t('owner.home.planPaid', { percent: Math.round(plan.percentPaid) })}
            </Text>
          </Card>
        </Pressable>
      )}

      <SectionTitle
        title={t('owner.home.activeRequests')}
        {...(open > 0
          ? {
              action: {
                label: t('owner.home.seeAllCount', { count: open }),
                onPress: () => {
                  router.push('/requests');
                },
              },
            }
          : {})}
      />
      {top.length === 0 ? <Body muted>{t('owner.home.allInOrder')}</Body> : null}
      {top.map((r) => (
        <RequestRow
          key={r.id}
          r={r}
          onPress={() => {
            router.push({ pathname: '/request/[id]', params: { id: r.id } });
          }}
        />
      ))}

      <ConstructionLine
        update={latestUpdate}
        onPress={() => {
          router.push({ pathname: '/unit', params: scrollParams('construction', Date.now()) });
        }}
      />

      {data === null || data.posts.length === 0 ? null : (
        <>
          <SectionTitle
            title={t('tab.news')}
            action={{
              label: t('owner.home.seeAll'),
              onPress: () => {
                router.push('/news');
              },
            }}
          />
          <NewsCarousel
            posts={data.posts}
            onOpen={() => {
              router.push('/news');
            }}
          />
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.muted },
  amount: { fontFamily: fonts.light, fontSize: 28, color: colors.navy, fontVariant: ['tabular-nums'] },
  urgent: { color: colors.urgent },
  small: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: space.xs },
});
