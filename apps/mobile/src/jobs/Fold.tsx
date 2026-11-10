/**
 * A section of the job page that opens and closes with one tap (R3: the problem, messages, quote and
 * make-safe, finished-work photos), closed by default so the page stays short. Screen readers hear a button
 * and whether it is open.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cardShadow, colors, fonts, radius, space } from '../ui/theme.js';

export function Fold(props: {
  title: string;
  /** A short line under the title while closed ("Photos: 2", "AED 450 · Waiting for the owner"). */
  detail?: string | null;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: props.open }}
        onPress={props.onToggle}
        style={styles.header}
      >
        <View style={styles.text}>
          <Text style={styles.title}>{props.title}</Text>
          {props.detail === undefined || props.detail === null ? null : (
            <Text style={styles.detail}>{props.detail}</Text>
          )}
        </View>
        <Ionicons name={props.open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.slate} />
      </Pressable>
      {props.open ? <View style={styles.body}>{props.children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, ...cardShadow },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    minHeight: 56,
  },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.semibold, fontSize: 16, color: colors.navy },
  detail: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  body: { gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md },
});
