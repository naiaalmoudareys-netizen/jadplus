/**
 * The booked visit and the latest quote on a request (ADR 0018), as the resident and the partner both see
 * them. Only the technician's name is shown, never their contact details (ADR 0009).
 */
import type { RequestDetail } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { quoteStatusLabel, validUntilLabel, visitLabel } from '../jobs/journey.js';
import { useLang } from '../i18n/I18nProvider.js';
import { aed } from '../portal/format.js';
import { Body, Card, Eyebrow } from '../ui/kit.js';
import { colors, fonts, space } from '../ui/theme.js';

export function VisitCard({ visit }: { visit: NonNullable<RequestDetail['visit']> }): ReactNode {
  const lang = useLang();
  const { t } = lang;
  return (
    <Card>
      <Eyebrow>{t('journey.visit.title')}</Eyebrow>
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

const styles = StyleSheet.create({
  big: { fontFamily: fonts.semibold, fontSize: 20, color: colors.navy },
  meta: { gap: 2, marginBottom: space.xs },
});
