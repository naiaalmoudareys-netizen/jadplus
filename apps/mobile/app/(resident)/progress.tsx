/**
 * Construction progress (O1, docs/DESIGN.md): JAD Global's published updates for the owner's projects, with
 * their photos (several swipe sideways), stage and % complete.
 */
import type { ConstructionUpdate } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { longDate } from '../../src/portal/format.js';
import { Photo } from '../../src/portal/Photo.js';
import { usePortal } from '../../src/portal/PortalProvider.js';
import { DemoBadge, PortalError, ProgressBar } from '../../src/portal/ui.js';
import { Body, Card, Heading, Loading, Page } from '../../src/ui/kit.js';
import { colors, fonts, space } from '../../src/ui/theme.js';

function Photos({ update }: { update: ConstructionUpdate }): ReactNode {
  const { width } = useWindowDimensions();
  if (update.photos.length <= 1) {
    return <Photo id={update.photos[0] ?? null} project={update.project} label={update.title} />;
  }
  // Several photos: swipe sideways, each nearly the card's width.
  const photoWidth = width - 2 * space.lg - 2 * space.md - space.lg;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {update.photos.map((id, i) => (
        <View key={id} style={{ width: photoWidth }}>
          <Photo id={id} project={update.project} label={`${update.title}, photo ${String(i + 1)}`} />
        </View>
      ))}
    </ScrollView>
  );
}

export default function Progress(): ReactNode {
  const { data, error, loading } = usePortal();
  if (loading && data === null) return <Loading />;
  if (data === null || error !== null) {
    return (
      <Page>
        <PortalError />
      </Page>
    );
  }
  return (
    <Page>
      <DemoBadge />
      <Heading>Construction</Heading>
      {data.updates.length === 0 ? <Body muted>No construction updates yet.</Body> : null}
      {data.updates.map((u) => (
        <Card key={u.id}>
          <Photos update={u} />
          <Text style={styles.eyebrow}>
            {[u.project, u.building, u.date === null ? null : longDate(u.date)]
              .filter((x) => x !== null)
              .join(' · ')
              .toUpperCase()}
          </Text>
          <Text style={styles.title}>{u.title}</Text>
          {u.percent === null ? null : (
            <View style={styles.progress}>
              <ProgressBar percent={u.percent} />
              <Text style={styles.percent}>
                {`${String(Math.round(u.percent))}% complete${u.stage === null ? '' : ` · ${u.stage}`}`}
              </Text>
            </View>
          )}
          {u.details === null ? null : <Body>{u.details}</Body>}
          {u.handover === null ? null : <Body muted>{`Expected handover ${longDate(u.handover)}`}</Body>}
        </Card>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  strip: { gap: space.sm },
  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.bronze,
    marginTop: space.sm,
  },
  title: { fontFamily: fonts.light, fontSize: 22, lineHeight: 28, color: colors.navy },
  progress: { gap: space.xs },
  percent: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
});
