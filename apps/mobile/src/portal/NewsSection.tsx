/**
 * News & exclusive offers (docs/DESIGN.md N1-N3). Calm cards: photo, a small "NEWS · 9 NOV 2026" line, the
 * title and a short summary; tapping opens the full text. An owners-only offer shows the residence, the list
 * price crossed out next to the owners' price, and "I'm interested" (N2), which tells the JAD+ desk; nothing
 * is bought or reserved in the app.
 */
import { dubaiDate, isOffer, newsFeed, offerCount, type NewsFilter, type OwnerPost } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { errorText } from '../api/client.js';
import { interestedInOffer } from '../api/endpoints.js';
import { aed, area, longDate } from './format.js';
import { useLang, useT, type Translate } from '../i18n/I18nProvider.js';
import { Photo } from './Photo.js';
import { usePortal } from './PortalProvider.js';
import { Fact } from './ui.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Card, Heading, Notice } from '../ui/kit.js';
import { buttonRadius, colors, fonts, space } from '../ui/theme.js';

/**
 * The post's kind for its small eyebrow line: Salesforce's default "News" in the person's language, any other
 * kind JAD Global wrote shown as received.
 */
export function newsKind(type: string, t: Translate): string {
  return type === 'News' ? t('owner.news.news') : type;
}

function Prices({ price, offerPrice }: { price: number | null; offerPrice: number | null }): ReactNode {
  const { t, locale } = useLang();
  if (offerPrice === null) return null;
  return (
    <View style={styles.prices}>
      <Text style={styles.offerPrice}>{aed(offerPrice, locale)}</Text>
      {price === null || price <= offerPrice ? null : (
        <Text
          style={styles.listPrice}
          accessibilityLabel={t('owner.news.listPrice', { price: aed(price, locale) })}
        >
          {aed(price, locale)}
        </Text>
      )}
    </View>
  );
}

function Interest({
  post,
  interested,
  onDone,
}: {
  post: OwnerPost;
  interested: boolean;
  onDone: () => void;
}): ReactNode {
  const { api } = useSessionController();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  if (interested) return <Notice>{t('owner.news.thanks')}</Notice>;
  const say = async () => {
    setBusy(true);
    setError(null);
    try {
      await interestedInOffer(api, post.id);
      onDone();
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button title={t('owner.news.interested')} busy={busy} onPress={() => void say()} />
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </>
  );
}

function PostCard(props: { post: OwnerPost; interested: boolean; onInterested: () => void }): ReactNode {
  const lang = useLang();
  const { t, locale } = lang;
  const { post } = props;
  const [open, setOpen] = useState(false);
  const offer = isOffer(post);
  const o = post.offer;
  const kind = offer ? t('owner.news.ownersOnly') : newsKind(post.type, t);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={t(open ? 'owner.news.showsLess' : 'owner.news.showsFull')}
        onPress={() => {
          setOpen(!open);
        }}
        style={styles.cardBody}
      >
        <Photo id={post.photos[0] ?? null} project={post.project} label={post.title} />
        <Text style={[styles.eyebrow, offer && styles.offerEyebrow]}>
          {`${kind} · ${longDate(post.date, locale)}`.toUpperCase()}
        </Text>
        <Text style={styles.title}>{post.title}</Text>
        {post.summary === null ? null : <Text style={styles.summary}>{post.summary}</Text>}
        {offer && o !== null ? <Prices price={o.price} offerPrice={o.offerPrice} /> : null}
        <Text style={styles.more}>{t(open ? 'owner.news.showLess' : 'owner.news.readMore')}</Text>
      </Pressable>
      {open ? (
        <View style={styles.cardBody}>
          {post.body === null ? null : <Body>{post.body}</Body>}
          {offer && o !== null ? (
            <View>
              <Fact label={t('owner.fact.residence')} value={o.unitName} />
              <Fact label={t('owner.fact.type')} value={o.type} />
              <Fact label={t('owner.fact.floor')} value={o.floor} />
              <Fact label={t('owner.fact.size')} value={area(o.totalArea, lang)} />
              <Fact label={t('owner.fact.view')} value={o.view} />
            </View>
          ) : null}
          {offer && post.expires !== null ? (
            <Body muted>{t('owner.news.offerEnds', { date: longDate(post.expires, locale) })}</Body>
          ) : null}
          {offer ? <Interest post={post} interested={props.interested} onDone={props.onInterested} /> : null}
          {post.link === null ? null : (
            <Button
              title={t('owner.news.openSite')}
              kind="secondary"
              onPress={() => void Linking.openURL(post.link ?? '')}
            />
          )}
        </View>
      ) : null}
    </Card>
  );
}

/** News & offers, at the end of Home (Naya, 10-Nov-2026). */
export function NewsSection(): ReactNode {
  const { data, reload } = usePortal();
  const [filter, setFilter] = useState<NewsFilter>('all');
  const t = useT();
  if (data === null) return null;
  const today = dubaiDate(Date.now());
  const feed = newsFeed(data.posts, filter, today);
  const offers = offerCount(data.posts, today);
  const filters: { key: NewsFilter; label: string }[] = [
    { key: 'all', label: t('owner.news.all') },
    { key: 'news', label: t('owner.news.news') },
    { key: 'offers', label: t('owner.news.offers', { count: offers }) },
  ];
  return (
    <>
      <Heading>{t('tab.news')}</Heading>
      <View style={styles.filters} accessibilityRole="tablist">
        {filters.map((f) => (
          <Pressable
            key={f.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.key }}
            onPress={() => {
              setFilter(f.key);
            }}
            style={[styles.filter, filter === f.key && styles.filterOn]}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextOn]}>
              {f.label.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
      {feed.length === 0 ? <Body muted>{t('owner.news.empty')}</Body> : null}
      {feed.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          interested={data.interestedOfferIds.includes(post.id)}
          onInterested={() => void reload()}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: space.sm },
  filter: {
    borderRadius: buttonRadius,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  filterOn: { backgroundColor: colors.slate, borderColor: colors.slate },
  filterText: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.6, color: colors.textSecondary },
  filterTextOn: { color: colors.onNavy },
  cardBody: { gap: space.sm },
  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.muted,
    marginTop: space.xs,
  },
  offerEyebrow: { color: colors.bronze },
  title: { fontFamily: fonts.light, fontSize: 22, lineHeight: 28, color: colors.navy },
  summary: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: colors.textSecondary },
  prices: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  offerPrice: { fontFamily: fonts.semibold, fontSize: 18, color: colors.navy, fontVariant: ['tabular-nums'] },
  listPrice: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  more: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.4, color: colors.slate },
});
