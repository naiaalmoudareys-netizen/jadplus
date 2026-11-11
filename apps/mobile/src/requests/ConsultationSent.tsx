/**
 * After a consultation is sent (ADR 0031; O5, S4): "Sent. [provider] will contact you within [target]", the
 * target being the service's first deadline (service-targets.ts), the reference, and a way to follow it.
 */
import type { ConsultationRaised, ServiceView } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useT } from '../i18n/I18nProvider.js';
import { serviceName } from '../i18n/sharedLabels.js';
import { Body, Button, Eyebrow, Heading, Page } from '../ui/kit.js';
import { colors, fonts } from '../ui/theme.js';
import { contactWithin } from './consultationWords.js';

export function ConsultationSent(props: {
  service: ServiceView;
  raised: ConsultationRaised;
  onFollow: () => void;
}): ReactNode {
  const t = useT();
  return (
    <Page>
      <Eyebrow>{t('req.sent.eyebrow')}</Eyebrow>
      <Heading>{serviceName(props.service.code, props.service.name, t)}</Heading>
      <Text style={styles.confirmation}>
        {t('cons.sent.line', {
          provider: props.raised.sentTo,
          target: contactWithin(props.service.code, t),
        })}
      </Text>
      <Body muted>{t('req.sent.reference', { ref: props.raised.ref })}</Body>
      <Button title={t('req.follow')} onPress={props.onFollow} />
    </Page>
  );
}

const styles = StyleSheet.create({
  confirmation: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 28, color: colors.navy },
});
