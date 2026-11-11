/**
 * Notifications (ADR 0019): what happened on the person's requests and what is coming up, newest first under
 * Today, Yesterday and Earlier (Dubai dates), written by the app in the person's language. Tapping one marks it
 * read and opens its request (a tenancy item: My unit for owners, Home for tenants; for a technician or the
 * partner office, the job page, except an emergency moved to the backup partner, which only reads as read; a
 * handover item opens My unit at the handover card, an education item Investor Education, ADR 0035);
 * "Mark all as read" clears the dots; pull down to refresh. Reached from the bell on Home and on Today.
 */
import type { Inbox, InboxItem } from '@jadplus/shared';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { inbox, markInboxRead } from '../src/api/endpoints.js';
import { useLang } from '../src/i18n/I18nProvider.js';
import { InboxEmpty, InboxRow } from '../src/inbox/InboxParts.js';
import { inboxGroups, inboxTarget } from '../src/inbox/wording.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { useLoad, useNow } from '../src/ui/hooks.js';
import { scrollParams } from '../src/ui/scrollTarget.js';
import { Loading, Notice } from '../src/ui/kit.js';
import { colors, fonts, space } from '../src/ui/theme.js';

/** The list as last loaded, with the items read on this screen already shown as read. */
function withRead(data: Inbox | null, read: ReadonlySet<string> | 'all'): InboxItem[] {
  return (data?.items ?? []).map((i) => (read === 'all' || read.has(i.id) ? { ...i, read: true } : i));
}

export default function Notifications(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const router = useRouter();
  const { t } = useLang();
  const now = useNow(60_000);
  const load = useCallback(() => inbox(api), [api]);
  const list = useLoad(load);
  const [read, setRead] = useState<ReadonlySet<string> | 'all'>(new Set());
  const [pulling, setPulling] = useState(false);

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if (list.loading && list.data === null) return <Loading />;

  const { role } = session.me;
  const partner = role === 'partner' || role === 'partner_admin';
  const items = withRead(list.data, read);
  const unread = items.some((i) => !i.read);
  const sections = inboxGroups(items, now).map((g) => ({
    key: g.key,
    title: t(`inbox.${g.key}`),
    data: g.items,
  }));

  const refresh = () => {
    setPulling(true);
    void list.reload().finally(() => {
      setRead(new Set());
      setPulling(false);
    });
  };
  // Marking read is a courtesy: if it fails, the dot comes back on the next refresh and nothing else breaks.
  const open = (item: InboxItem) => {
    if (!item.read) {
      setRead((r) => (r === 'all' ? r : new Set(r).add(item.id)));
      markInboxRead(api, { ids: [item.id] }).catch(() => undefined);
    }
    const target = inboxTarget(item, role);
    if (target === null) return;
    if ('jobId' in target) router.push({ pathname: '/partner/job/[id]', params: { id: target.jobId } });
    else if ('requestId' in target)
      router.push({ pathname: '/request/[id]', params: { id: target.requestId } });
    else if ('screen' in target) router.push('/education');
    else if (target.section !== undefined)
      router.push({
        pathname: target.tab === 'unit' ? '/unit' : '/home',
        params: scrollParams(target.section, Date.now()),
      });
    else router.push(target.tab === 'unit' ? '/unit' : '/home');
  };
  const markAll = () => {
    setRead('all');
    markInboxRead(api, { all: true }).catch(() => undefined);
  };

  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={refresh} tintColor={colors.slate} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {list.error === null ? null : <Notice tone="error">{list.error}</Notice>}
            {unread ? (
              <Pressable accessibilityRole="button" onPress={markAll} hitSlop={12} style={styles.markAll}>
                <Text style={styles.link}>{t('inbox.markAll').toUpperCase()}</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={list.error === null ? <InboxEmpty partner={partner} /> : undefined}
        renderSectionHeader={({ section }) => (
          <Text style={styles.section}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item }) => (
          <InboxRow
            item={item}
            now={now}
            onPress={() => {
              open(item);
            }}
          />
        )}
        ItemSeparatorComponent={Gap}
      />
    </SafeAreaView>
  );
}

function Gap(): ReactNode {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.lg, paddingTop: space.sm, flexGrow: 1 },
  header: { gap: space.sm },
  markAll: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center' },
  link: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.slate },
  section: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.muted,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  gap: { height: space.sm },
});
