/**
 * Where the job is (ADR 0009: building and address from Salesforce, never the resident's contact details), an
 * "Open in Maps" button (a search for the building: no coordinates exist) and the resident's preferred day and
 * time (ADR 0013).
 */
import type { PartnerJob } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useLang } from '../i18n/I18nProvider.js';
import { mapsLink } from '../partner/logic.js';
import { Body, Button, Notice } from '../ui/kit.js';
import { cardShadow, colors, radius, space } from '../ui/theme.js';
import { placeLabel, preferredVisitLabel } from './format.js';

export function JobPlace({ job }: { job: PartnerJob }): ReactNode {
  const lang = useLang();
  const { t } = lang;
  const [failed, setFailed] = useState(false);
  const link = mapsLink(job.location, Platform.OS === 'ios' ? 'ios' : 'android');
  const preferred = preferredVisitLabel(job, lang);
  const openMaps = (url: string) => {
    setFailed(false);
    Linking.openURL(url).catch(() => {
      setFailed(true);
    });
  };
  return (
    <View style={styles.card}>
      <Body>{placeLabel(job.location, t)}</Body>
      {job.location?.address ? <Body muted>{job.location.address}</Body> : null}
      {preferred === null ? null : <Body muted>{preferred}</Body>}
      {link === null ? null : (
        <Button
          title={t('partner.openMaps')}
          kind="secondary"
          onPress={() => {
            openMaps(link);
          }}
        />
      )}
      {failed ? <Notice tone="error">{t('partner.mapsError')}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.md,
    gap: space.xs,
    ...cardShadow,
  },
});
