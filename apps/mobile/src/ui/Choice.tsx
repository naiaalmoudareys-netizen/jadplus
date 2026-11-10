/** A selectable option (radio-style): projects, units, services, days and time windows. */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { buttonRadius, colors, fonts, space } from './theme.js';

export function Choice(props: {
  title: string;
  detail?: string;
  selected: boolean;
  disabled?: boolean;
  /** Smaller, for rows of chips (days, projects). */
  compact?: boolean;
  onPress: () => void;
}): ReactNode {
  const off = props.disabled === true;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected, disabled: off }}
      disabled={off}
      onPress={props.onPress}
      style={[
        styles.choice,
        props.compact === true && styles.compact,
        props.selected && styles.chosen,
        off && styles.off,
      ]}
    >
      <Text style={[styles.title, props.selected && styles.chosenText]}>{props.title}</Text>
      {props.detail === undefined ? null : <Text style={styles.detail}>{props.detail}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    backgroundColor: colors.card,
    borderRadius: buttonRadius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: 2,
  },
  compact: { paddingVertical: 12, paddingHorizontal: 14 },
  chosen: { borderColor: colors.slate, borderWidth: 2 },
  off: { opacity: 0.5 },
  title: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  chosenText: { color: colors.slate },
  detail: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
});
