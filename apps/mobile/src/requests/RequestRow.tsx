/** One of the resident's requests in a list: what, reference, status, who handles it, arrival and where. */
import type { RequestSummary } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { arrivalLabel, jobTitle, placeLabel, residentStatusLabel } from '../jobs/format.js';
import { useT } from '../i18n/I18nProvider.js';
import { PartnerName } from '../ui/HelpBits.js';
import { cardShadow, colors, fonts, radius, space } from '../ui/theme.js';

export function RequestRow({ r, onPress }: { r: RequestSummary; onPress: () => void }): ReactNode {
  const t = useT();
  const arrival = arrivalLabel(r, t);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, r.emergency && styles.emergency, pressed && styles.pressed]}
    >
      <View style={styles.rowTop}>
        <Text style={[styles.title, r.emergency && styles.urgent]}>{jobTitle(r, t)}</Text>
        <Text style={styles.ref}>{r.ref}</Text>
      </View>
      <Text style={styles.status}>{residentStatusLabel(r.status, t)}</Text>
      {r.partnerName === null ? null : (
        <PartnerName name={r.partnerName} verified={r.partnerVerified} kind={r.partnerKind} />
      )}
      {arrival === null ? null : <Text style={styles.status}>{arrival}</Text>}
      <Text style={styles.place}>{placeLabel(r.location, t)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.md,
    gap: space.xs,
    ...cardShadow,
  },
  emergency: { borderWidth: 1, borderColor: colors.urgent },
  pressed: { opacity: 0.7 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  title: { fontSize: 17, fontFamily: fonts.semibold, color: colors.text, flexShrink: 1 },
  urgent: { color: colors.urgent },
  ref: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted },
  status: { fontSize: 15, fontFamily: fonts.regular, color: colors.text },
  place: { fontSize: 14, fontFamily: fonts.regular, color: colors.muted },
});
