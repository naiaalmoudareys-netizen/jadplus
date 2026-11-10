/**
 * News & exclusive offers (docs/DESIGN.md N1-N3). Calm cards: photo, a small "NEWS · 9 NOV 2026" line, the
 * title and a short summary; tapping opens the full text. An owners-only offer shows the residence, the list
 * price crossed out next to the owners' price, and "I'm interested" (N2), which tells the JAD+ desk; nothing
 * is bought or reserved in the app.
 */
import { dubaiDate, isOffer, newsFeed, offerCount, type NewsFilter, type OwnerPost } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../api/client.js';
import { interestedInOffer } from '../api/endpoints.js';
import { aed, area, longDate } from './format.js';
import { useLang } from '../i18n/I18nProvider.js';
import { Photo } from './Photo.js';
import { usePortal } from './PortalProvider.js';
import { Fact } from './ui.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Card, Heading, Notice } from '../ui/kit.js';
import { buttonRadius, colors, fonts, space } from '../ui/theme.js';

function Prices({ price, offerPrice }: { price: number | null; offerPrice: number | null }): ReactNode {
  const { locale } = useLang();
  if (offerPrice === null) return null;
  return (
    <View style={styles.prices}>
      <Text style={styles.offerPrice}>{aed(offerPrice, locale)}</Text>
      {price === null || price <= offerPrice ? null : (
        <Text style={styles.listPrice} accessibilityLabel={`List price ${aed(price, locale)}`}>
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
  if (interested)
    return <Notice>Thank you. The JAD+ desk will contact you in the app about this residence.</Notice>;
  const say = async () => {
    setBusy(true);
    setError(null);
    try {
      await interestedInOffer(api, post.id);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button title="I'm interested" busy={busy} onPress={() => void say()} />
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </>
  );
}

function PostCard(props: { post: OwnerPost; interested: boolean; onInterested: () => void }): ReactNode {
  const lang = useLang();
  const { locale } = lang;
  const { post } = props;
  const [open, setOpen] = useState(false);
  const offer = isOffer(post);
  const o = post.offer;
  const kind = offer ? 'Owners only' : post.type;
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? 'Shows less' : 'Shows the full text'}
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
        <Text style={styles.more}>{open ? 'Show less' : 'Read more'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.cardBody}>
          {post.body === null ? null : <Body>{post.body}</Body>}
          {offer && o !== null ? (
            <View>
              <Fact label="Residence" value={o.unitName} />
              <Fact label="Type" value={o.type} />
              <Fact label="Floor" value={o.floor} />
              <Fact label="Size" value={area(o.totalArea, lang)} />
              <Fact label="View" value={o.view} />
            </View>
          ) : null}
          {offer && post.expires !== null ? (
            <Body muted>{`Offer ends ${longDate(post.expires, locale)}`}</Body>
          ) : null}
          {offer ? <Interest post={post} interested={props.interested} onDone={props.onInterested} /> : null}
          {post.link === null ? null : (
            <Button
              title="Open on jadglobal.ae"
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
  if (data === null) return null;
  const today = dubaiDate(Date.now());
  const feed = newsFeed(data.posts, filter, today);
  const offers = offerCount(data.posts, today);
  const filters: { key: NewsFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'news', label: 'News' },
    { key: 'offers', label: `Offers ${String(offers)}` },
  ];
  return (
    <>
      <Heading>News & offers</Heading>
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
      {feed.length === 0 ? <Body muted>Nothing here yet.</Body> : null}
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
