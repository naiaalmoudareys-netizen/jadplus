/** Small building blocks shared by every screen: page, heading, text, field, button, notice. */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space } from './theme.js';

export function Page({ children, scroll = true }: { children: ReactNode; scroll?: boolean }): ReactNode {
  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView> : children}
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: ReactNode }): ReactNode {
  return (
    <Text style={styles.heading} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }): ReactNode {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Field({ label, ...input }: TextInputProps & { label: string }): ReactNode {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
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
      accessibilityState={{ disabled: off, busy: props.busy === true }}
      disabled={off}
      onPress={props.onPress}
      style={({ pressed }) => [styles.button, styles[kind], (pressed || off) && styles.dim]}
    >
      {props.busy === true ? (
        <ActivityIndicator color={kind === 'secondary' ? colors.navy : colors.onNavy} />
      ) : (
        <Text style={[styles.buttonText, kind === 'secondary' && styles.secondaryText]}>{props.title}</Text>
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
      <ActivityIndicator size="large" color={colors.navy} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, gap: space.md },
  heading: { fontSize: 24, fontWeight: '600', color: colors.navy },
  body: { fontSize: 17, lineHeight: 24, color: colors.text },
  muted: { color: colors.muted },
  field: { gap: space.xs },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    fontSize: 18,
    color: colors.text,
  },
  button: { borderRadius: radius, paddingVertical: 16, alignItems: 'center', minHeight: 54 },
  primary: { backgroundColor: colors.navy },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.navy },
  danger: { backgroundColor: colors.urgent },
  dim: { opacity: 0.6 },
  buttonText: { color: colors.onNavy, fontSize: 18, fontWeight: '600' },
  secondaryText: { color: colors.navy },
  notice: { backgroundColor: colors.card, borderRadius: radius, padding: space.md },
  noticeError: { backgroundColor: colors.urgentSoft },
  errorText: { color: colors.urgent },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
