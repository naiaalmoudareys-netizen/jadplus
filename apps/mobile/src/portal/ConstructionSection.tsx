/**
 * Construction progress (O1, docs/DESIGN.md): JAD Global's published updates for the unit's project, with
 * their photos (several swipe sideways), stage and % complete. Shown at the end of My unit.
 */
import type { ConstructionUpdate } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { longDate } from './format.js';
import { useLang } from '../i18n/I18nProvider.js';
import { Photo } from './Photo.js';
import { usePortal } from './PortalProvider.js';
import { projectKey } from '../brand/projects.js';
import { ProgressBar } from './ui.js';
import { Body, Card, Heading } from '../ui/kit.js';
import { colors, fonts, space } from '../ui/theme.js';

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

/** Updates for one project (matched like the brand photos, so "JAD 288" and "J288" are the same project). */
function forProject(updates: readonly ConstructionUpdate[], project: string | null): ConstructionUpdate[] {
  const key = projectKey(project);
  return key === null ? [...updates] : updates.filter((u) => projectKey(u.project) === key);
}

/** Construction progress for the unit's project, at the end of My unit (Naya, 10-Nov-2026). */
export function ConstructionSection({ project }: { project: string | null }): ReactNode {
  const { data } = usePortal();
  const { locale } = useLang();
  if (data === null) return null;
  const updates = forProject(data.updates, project);
  return (
    <>
      <Heading>Construction</Heading>
      {updates.length === 0 ? <Body muted>No construction updates yet.</Body> : null}
      {updates.map((u) => (
        <Card key={u.id}>
          <Photos update={u} />
          <Text style={styles.eyebrow}>
            {[u.project, u.building, u.date === null ? null : longDate(u.date, locale)]
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
          {u.handover === null ? null : (
            <Body muted>{`Expected handover ${longDate(u.handover, locale)}`}</Body>
          )}
        </Card>
      ))}
    </>
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
