/**
 * News & exclusive offers (docs/DESIGN.md N1-N3): JAD Global's posts, pinned first then newest; filters All /
 * News / Offers (with count). An offer shows the residence, list and owners' price and "I'm interested" (N2),
 * which tells the JAD+ desk; nothing is bought or reserved in the app.
 */
import { dubaiDate, isOffer, newsFeed, offerCount, type NewsFilter, type OwnerPost } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../src/api/client.js';
import { interestedInOffer } from '../../src/api/endpoints.js';
import { aed, area, longDate } from '../../src/portal/format.js';
import { usePortal } from '../../src/portal/PortalProvider.js';
import { DemoBadge, Fact } from '../../src/portal/ui.js';
import { useSessionController } from '../../src/session/SessionProvider.js';
import { Hero } from '../../src/ui/brand.js';
import { Body, Button, Card, Heading, Loading, Notice, Page } from '../../src/ui/kit.js';
import { buttonRadius, colors, fonts, space } from '../../src/ui/theme.js';

function Offer({
  post,
  interested,
  onInterested,
}: {
  post: OwnerPost;
  interested: boolean;
  onInterested: () => void;
}): ReactNode {
  const { api } = useSessionController();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const o = post.offer;
  const say = async () => {
    setBusy(true);
    setError(null);
    try {
      await interestedInOffer(api, post.id);
      onInterested();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {o === null ? null : (
        <View>
          <Fact label="Residence" value={o.unitName} />
          <Fact label="Type" value={o.type} />
          <Fact label="Floor" value={o.floor} />
          <Fact label="Size" value={area(o.totalArea)} />
          <Fact label="View" value={o.view} />
          <Fact label="List price" value={o.price === null ? null : aed(o.price)} />
          <Fact label="Owners' price" value={o.offerPrice === null ? null : aed(o.offerPrice)} />
        </View>
      )}
      {post.expires === null ? null : <Body muted>{`Offer ends ${longDate(post.expires)}`}</Body>}
      {interested ? (
        <Notice>Thank you. The JAD+ desk will contact you in the app about this residence.</Notice>
      ) : (
        <Button title="I'm interested" busy={busy} onPress={() => void say()} />
      )}
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </>
  );
}

export default function News(): ReactNode {
  const { data, error, loading, reload } = usePortal();
  const [filter, setFilter] = useState<NewsFilter>('all');
  if (loading && data === null) return <Loading />;
  if (data === null) {
    return (
      <Page>
        <Notice tone="error">{error ?? 'News is not available right now.'}</Notice>
      </Page>
    );
  }
  const today = dubaiDate(Date.now());
  const feed = newsFeed(data.posts, filter, today);
  const offers = offerCount(data.posts, today);
  const filters: { key: NewsFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'news', label: 'News' },
    { key: 'offers', label: `Offers (${String(offers)})` },
  ];
  return (
    <Page>
      <DemoBadge />
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
        <Card key={post.id}>
          {post.project === null ? null : (
            <Hero project={post.project} eyebrow={post.project} title={post.type} />
          )}
          {isOffer(post) ? <Text style={styles.badge}>OWNERS ONLY</Text> : null}
          <Text style={styles.title}>{post.title}</Text>
          <Body muted>{longDate(post.date)}</Body>
          {post.summary === null ? null : <Body>{post.summary}</Body>}
          {post.body === null ? null : <Body muted>{post.body}</Body>}
          {isOffer(post) ? (
            <Offer
              post={post}
              interested={data.interestedOfferIds.includes(post.id)}
              onInterested={() => void reload()}
            />
          ) : null}
          {post.link === null ? null : (
            <Button
              title="Read more"
              kind="secondary"
              onPress={() => void Linking.openURL(post.link ?? '')}
            />
          )}
        </Card>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  filter: {
    borderRadius: buttonRadius,
    borderWidth: 1,
    borderColor: colors.slate,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  filterOn: { backgroundColor: colors.slate },
  filterText: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.4, color: colors.slate },
  filterTextOn: { color: colors.onNavy },
  badge: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 2.2, color: colors.bronze },
  title: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 24, color: colors.navy },
});
