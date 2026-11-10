/**
 * Building blocks shared by every screen, in the JAD+ look (docs/DESIGN.md): page, eyebrow, heading, text,
 * field, button, card, notice.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buttonRadius, cardShadow, colors, fonts, radius, space } from './theme.js';

export function Page({ children, scroll = true }: { children: ReactNode; scroll?: boolean }): ReactNode {
  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          // "handled": a tap on a button works first time even while the keyboard is open.
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Small bronze line above a heading ("YOUR HOME", "EMERGENCY"). */
export function Eyebrow({ children }: { children: string }): ReactNode {
  return <Text style={styles.eyebrow}>{children.toUpperCase()}</Text>;
}

export function Heading({ children }: { children: string }): ReactNode {
  return (
    <Text style={styles.heading} accessibilityRole="header">
      {children.toUpperCase()}
    </Text>
  );
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }): ReactNode {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }): ReactNode {
  return <View style={styles.card}>{children}</View>;
}

export function Field({ label, ...input }: TextInputProps & { label: string }): ReactNode {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...input}
      />
    </View>
  );
}

export function Button(props: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  kind?: 'primary' | 'secondary' | 'danger';
}): ReactNode {
  const kind = props.kind ?? 'primary';
  const off = props.disabled === true || props.busy === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.title}
      accessibilityState={{ disabled: off, busy: props.busy === true }}
      disabled={off}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        styles[kind],
        pressed && kind === 'primary' && styles.primaryPressed,
        off && styles.dim,
      ]}
    >
      {props.busy === true ? (
        <ActivityIndicator color={kind === 'secondary' ? colors.slate : colors.onNavy} />
      ) : (
        <Text style={[styles.buttonText, kind === 'secondary' && styles.secondaryText]}>
          {props.title.toUpperCase()}
        </Text>
      )}
    </Pressable>
  );
}

export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'error';
}): ReactNode {
  return (
    <View style={[styles.notice, tone === 'error' && styles.noticeError]} accessibilityLiveRegion="polite">
      <Text style={[styles.body, tone === 'error' && styles.errorText]}>{children}</Text>
    </View>
  );
}

export function Loading(): ReactNode {
  return (
    <View style={styles.centre}>
      <ActivityIndicator size="large" color={colors.slate} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.md },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 2.4, color: colors.bronze },
  heading: { fontFamily: fonts.light, fontSize: 28, letterSpacing: -0.5, color: colors.navy },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 24, color: colors.text },
  muted: { color: colors.textSecondary },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.md,
    gap: space.xs,
    ...cardShadow,
  },
  field: { gap: space.xs },
  label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.5, color: colors.muted },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: buttonRadius,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 17,
    color: colors.text,
  },
  button: {
    borderRadius: buttonRadius,
    paddingVertical: 15,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primary: { backgroundColor: colors.slate },
  primaryPressed: { backgroundColor: colors.slatePressed },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.slate },
  danger: { backgroundColor: colors.urgent },
  dim: { opacity: 0.5 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 2, color: colors.onNavy },
  secondaryText: { color: colors.slate },
  notice: { backgroundColor: colors.mist, borderRadius: radius, padding: space.md },
  noticeError: { backgroundColor: colors.urgentSoft },
  errorText: { color: colors.urgent },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
