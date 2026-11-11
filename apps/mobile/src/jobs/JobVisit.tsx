/**
 * When and where (R3): the booked visit's day and window ("Today 09:00-12:00") and technician, or an
 * acknowledged emergency's arrival window (E4), or "Not booked yet" with the resident's preferred day and time
 * (ADR 0013); then the unit (ADR 0009: building and address from Salesforce, never the resident's contact
 * details) and "Open in Maps" (a search for the building: no coordinates exist).
 */
import { dubaiClock, dubaiDate, type PartnerJob, type RequestDetail } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, Text } from 'react-native';
import { useLang } from '../i18n/I18nProvider.js';
import type { Lang } from '../i18n/lang.js';
import { mapsLink } from '../partner/logic.js';
import { Body, Button, Card, Notice } from '../ui/kit.js';
import { colors, fonts } from '../ui/theme.js';
import { dayLabel, placeLabel, preferredVisitLabel, visitLine } from './format.js';

type Visit = NonNullable<RequestDetail['visit']>;

/** "Today · 09:00-12:00", or "Wed 11 Nov · 09:00-12:00" on another day (Dubai time). */
function whenLabel(visit: Visit, now: number, lang: Lang): string {
  const date = dubaiDate(visit.start);
  return lang.t('journey.visit.when', {
    day: date === dubaiDate(now) ? lang.t('job.page.today') : dayLabel(date, lang.locale),
    from: dubaiClock(visit.start),
    to: dubaiClock(visit.end),
  });
}

export function JobVisit(props: { job: PartnerJob; visit: Visit | null; now: number }): ReactNode {
  const lang = useLang();
  const { t } = lang;
  const { job, visit } = props;
  const [failed, setFailed] = useState(false);
  const link = mapsLink(job.location, Platform.OS === 'ios' ? 'ios' : 'android');
  const arrival = visitLine(job, lang);
  const when = visit === null ? (arrival ?? t('job.page.notBooked')) : whenLabel(visit, props.now, lang);
  const preferred = visit === null && arrival === null ? preferredVisitLabel(job, lang) : null;
  const technician = visit?.technician ?? null;
  const openMaps = (url: string) => {
    setFailed(false);
    Linking.openURL(url).catch(() => {
      setFailed(true);
    });
  };
  return (
    <Card>
      <Text style={styles.when}>{when}</Text>
      {technician === null ? null : <Body muted>{t('journey.visit.technician', { name: technician })}</Body>}
      {preferred === null ? null : <Body muted>{preferred}</Body>}
      <Body>{placeLabel(job.location, t)}</Body>
      {job.location?.address ? <Body muted>{job.location.address}</Body> : null}
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
    </Card>
  );
}

const styles = StyleSheet.create({
  when: { fontFamily: fonts.semibold, fontSize: 20, color: colors.navy },
});
