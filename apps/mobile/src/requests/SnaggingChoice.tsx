/**
 * O3 (ADR 0032): in the new-request sheet for snagging, the owner chooses soft snagging (free, by the JAD
 * Global handover team) or professional snagging (an independent inspector, from AED 999).
 */
import type { SnaggingType } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../i18n/I18nProvider.js';
import { Choice } from '../ui/Choice.js';
import { Eyebrow } from '../ui/kit.js';
import { space } from '../ui/theme.js';
import { SNAGGING_OPTIONS } from './reportLogic.js';

export function SnaggingChoice(props: {
  value: SnaggingType | null;
  onChange: (type: SnaggingType) => void;
}): ReactNode {
  const t = useT();
  return (
    <View style={styles.box}>
      <Eyebrow>{t('report.snagging.choose')}</Eyebrow>
      {SNAGGING_OPTIONS.map((o) => (
        <Choice
          key={o.type}
          title={t(o.title)}
          detail={t(o.detail, { price: o.priceFromAed ?? 0 })}
          selected={props.value === o.type}
          onPress={() => {
            props.onChange(o.type);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm } });
