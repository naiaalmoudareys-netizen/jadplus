/**
 * A pop-up that slides up from the bottom with a title, a subtitle and a close button (the frame of the request
 * pop-ups, ADR 0015). The content scrolls; tapping outside or the close button closes it unless `busy`.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../i18n/I18nProvider.js';
import { colors, fonts, radius, space } from '../ui/theme.js';

export function BottomSheet(props: {
  title: string;
  subtitle: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  const t = useT();
  const close = () => {
    if (!props.busy) props.onClose();
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel={t('common.close')} style={styles.dismiss} onPress={close} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{props.title}</Text>
                <Text style={styles.subtitle}>{props.subtitle}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                hitSlop={12}
                onPress={close}
              >
                <Ionicons name="close" size={26} color={colors.slate} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {props.children}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,2,41,0.45)' },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius * 1.5,
    borderTopRightRadius: radius * 1.5,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    marginTop: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.light, fontSize: 24, letterSpacing: -0.3, color: colors.navy },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  content: { gap: space.lg, paddingHorizontal: space.lg, paddingBottom: space.lg },
});
