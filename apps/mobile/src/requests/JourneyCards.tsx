/**
 * The booked visit and the latest quote on a request (ADR 0018), as the resident and the partner both see
 * them. Only the technician's name is shown, never their contact details (ADR 0009).
 */
import type { RequestDetail } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { quoteStatusLabel, validUntilLabel, visitLabel, visitStatusLabel } from '../jobs/journey.js';
import { useLang } from '../i18n/I18nProvider.js';
import { aed } from '../portal/format.js';
import { Body, Card, Eyebrow } from '../ui/kit.js';
import { colors, fonts, space } from '../ui/theme.js';

/** The visit with where it stands (A8): a bronze "On the way", a green "Arrived" or "Visit done". */
export function VisitCard({
  visit,
  viewer,
}: {
  visit: NonNullable<RequestDetail['visit']>;
  viewer: 'partner' | 'resident';
}): ReactNode {
  const lang = useLang();
  const { t } = lang;
  const moving = visit.status === 'on_the_way';
  const there = visit.status === 'arrived' || visit.status === 'done';
  return (
    <Card>
      <View style={styles.titleRow}>
        <Eyebrow>{t('journey.visit.title')}</Eyebrow>
        <View
          style={[styles.pill, moving && styles.pillMoving, there && styles.pillThere]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.pillText, moving && styles.pillTextMoving, there && styles.pillTextThere]}>
            {visitStatusLabel(visit.status, viewer, t)}
          </Text>
        </View>
      </View>
      <Text style={styles.big}>{visitLabel(visit, lang)}</Text>
      {visit.technician === null ? null : (
        <Body muted>{t('journey.visit.technician', { name: visit.technician })}</Body>
      )}
    </Card>
  );
}

/** The quote with its amount, what it covers, until when it is valid and where it stands; `children` adds buttons. */
export function QuoteCard({
  quote,
  children,
}: {
  quote: NonNullable<RequestDetail['quote']>;
  children?: ReactNode;
}): ReactNode {
  const lang = useLang();
  const { t, locale } = lang;
  return (
    <Card>
      <Eyebrow>{quote.revision > 1 ? t('journey.quote.revised') : t('journey.quote.title')}</Eyebrow>
      <Text style={styles.big}>{aed(quote.amountAed, locale)}</Text>
      <Body>{quote.scope}</Body>
      <View style={styles.meta}>
        <Body muted>{quoteStatusLabel(quote.status, t)}</Body>
        {quote.status === 'pending' ? <Body muted>{validUntilLabel(quote, lang)}</Body> : null}
      </View>
      {children}
    </Card>
  );
}

/** E8: urgent make-safe work done within the owner's limit, with what was done. */
export function MakeSafeCard({
  makeSafe,
  title,
}: {
  makeSafe: NonNullable<RequestDetail['makeSafe']>;
  title: string;
}): ReactNode {
  const { locale } = useLang();
  return (
    <Card>
      <Eyebrow>{title}</Eyebrow>
      <Text style={styles.big}>{aed(makeSafe.amountAed, locale)}</Text>
      <Body>{makeSafe.scope}</Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.backgroundAlt,
  },
  pillMoving: { backgroundColor: colors.warnSoft },
  pillThere: { backgroundColor: colors.okSoft },
  pillText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textSecondary },
  pillTextMoving: { color: colors.warn },
  pillTextThere: { color: colors.ok },
  big: { fontFamily: fonts.semibold, fontSize: 20, color: colors.navy },
  meta: { gap: 2, marginBottom: space.xs },
});
