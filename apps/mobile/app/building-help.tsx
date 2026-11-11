/**
 * Building help (E12; ADR 0029; Naya, 11-Nov-2026: "a place where they can contact security for noise
 * complaint"). The building's security desk (noise, parking, access, visitors) and building management (common
 * areas, lifts, shared pipes, building-wide AC), each with its hours and a Call button. One chip per building
 * when the person's homes are in several. Owners and tenants; reached from My unit, Profile, the tenant's home
 * card and New request ("Problem outside your home?"). Information only (L3).
 */
import { BUILDING_LINE_KINDS, telHref } from '@jadplus/shared';
import { Redirect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { myBuildingLines } from '../src/api/endpoints.js';
import { useDial } from '../src/building/HelpLines.js';
import { LINE_WORDS, type PlaceLines } from '../src/building/lines.js';
import { placeTitle } from '../src/building/wording.js';
import { useT } from '../src/i18n/I18nProvider.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { Choice } from '../src/ui/Choice.js';
import { useLoad } from '../src/ui/hooks.js';
import { Body, Button, Card, Eyebrow, Loading, Notice, Page } from '../src/ui/kit.js';
import { colors, fonts, space } from '../src/ui/theme.js';

const keyOf = (p: PlaceLines): string => `${p.project}|${p.building ?? ''}`;

function Lines({ place }: { place: PlaceLines }): ReactNode {
  const t = useT();
  const { dial, problem } = useDial();
  return (
    <>
      {BUILDING_LINE_KINDS.map((kind) => {
        const line = place[kind];
        const href = line === null ? null : telHref(line.phone);
        const words = LINE_WORDS[kind];
        return (
          <Card key={kind}>
            <Eyebrow>{t(words.name)}</Eyebrow>
            <Body muted>{t(words.scope)}</Body>
            {line === null || href === null ? (
              <Body muted>{t('buildingHelp.notSet')}</Body>
            ) : (
              <>
                <Text style={styles.phone}>{line.phone}</Text>
                {line.hours === null ? null : <Body muted>{line.hours}</Body>}
                <Button
                  title={t('buildingHelp.call')}
                  onPress={() => {
                    dial({ kind, phone: line.phone, hours: line.hours, href });
                  }}
                />
              </>
            )}
          </Card>
        );
      })}
      {problem === null ? null : <Notice tone="error">{problem}</Notice>}
    </>
  );
}

export default function BuildingHelp(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const t = useT();
  const load = useCallback(() => myBuildingLines(api), [api]);
  const lines = useLoad(load);
  const [chosen, setChosen] = useState<string | null>(null);
  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if (lines.loading && lines.data === null) return <Loading />;
  const places = lines.data ?? [];
  const place = places.find((p) => keyOf(p) === chosen) ?? places[0] ?? null;
  return (
    <Page>
      <Notice>{t('buildingHelp.intro')}</Notice>
      {lines.error === null ? null : <Notice tone="error">{lines.error}</Notice>}
      {lines.error === null && place === null ? <Body muted>{t('buildingHelp.noHome')}</Body> : null}
      {places.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {places.map((p) => (
            <Choice
              key={keyOf(p)}
              compact
              title={placeTitle(p)}
              selected={p === place}
              onPress={() => {
                setChosen(keyOf(p));
              }}
            />
          ))}
        </ScrollView>
      ) : null}
      {place === null ? null : (
        <View style={styles.lines}>
          {place.security === null && place.management === null ? (
            <Body muted>{t('buildingHelp.noneHere')}</Body>
          ) : null}
          <Lines place={place} />
        </View>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.sm },
  lines: { gap: space.md },
  // A phone number reads left to right in every language, Arabic included.
  phone: {
    fontFamily: fonts.semibold,
    fontSize: 20,
    color: colors.navy,
    writingDirection: 'ltr',
    alignSelf: 'flex-start',
  },
});
