/**
 * Small shared pieces: the provider's name with the "JAD+ verified" badge (S8: owners see the name and the badge,
 * never scorecards), or "JAD Global team" for one of the group's own teams (ADR 0030), and a "talk to a person"
 * link that opens a JAD+ desk request with the words filled in (U1 missing residence, U11 payment page failed).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import type { ProviderKind } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MessageKey } from '../i18n/dictionary.js';
import { useI18n, useT } from '../i18n/I18nProvider.js';
import { providerBadge } from '../requests/provider.js';
import { colors, fonts, radius, space } from './theme.js';

export function PartnerName({
  name,
  verified,
  kind,
}: {
  name: string;
  verified: boolean;
  kind: ProviderKind | null;
}): ReactNode {
  const t = useT();
  const badge = providerBadge(kind, verified);
  const text = badge === 'jad_team' ? t('help.jadTeam') : t('help.verified');
  return (
    <View style={styles.partner}>
      <Text style={styles.name}>{name}</Text>
      {badge === null ? null : (
        <View style={styles.badge} accessibilityLabel={text}>
          <Ionicons
            name={badge === 'jad_team' ? 'business' : 'shield-checkmark'}
            size={13}
            color={colors.ok}
          />
          <Text style={styles.badgeText}>{text}</Text>
        </View>
      )}
    </View>
  );
}

/** A quiet link to the JAD+ desk with the request text filled in (the owner can still change it). */
export function DeskHelpLink(props: { title: MessageKey; note: MessageKey; text: MessageKey }): ReactNode {
  const router = useRouter();
  const { t, info } = useI18n();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        router.push({ pathname: '/desk-request', params: { type: 'Other', details: t(props.text) } });
      }}
      style={({ pressed }) => [styles.help, pressed && styles.pressed]}
    >
      <Ionicons name="chatbubbles-outline" size={20} color={colors.slate} />
      <View style={styles.helpText}>
        <Text style={styles.helpTitle}>{t(props.title)}</Text>
        <Text style={styles.helpNote}>{t(props.note)}</Text>
      </View>
      <Ionicons name={info.rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  partner: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  name: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.okSoft,
    borderRadius: radius,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.4, color: colors.ok },
  help: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  pressed: { opacity: 0.6 },
  helpText: { flex: 1, gap: 2 },
  helpTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.slate },
  helpNote: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
});
