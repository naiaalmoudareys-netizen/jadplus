/**
 * The pop-up that opens when the owner taps a service (Naya, 10-Nov-2026: "a pop up menu shows where he picks
 * the date the time and adds image and writing rather than having to scroll all the way down"). It slides up
 * from the bottom with the chosen unit and service, the day, the time window, the description and up to 3
 * photos (ADR 0013), and the Send button.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  MAX_REQUEST_PHOTOS,
  VISIT_SLOTS,
  dubaiDate,
  preferredDays,
  type ServiceView,
  type SnaggingType,
  type VisitSlot,
} from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
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
import { dayLabel } from '../jobs/format.js';
import { useLang } from '../i18n/I18nProvider.js';
import { serviceName, visitSlotLabel } from '../i18n/sharedLabels.js';
import { Choice } from '../ui/Choice.js';
import { Button, Eyebrow, Field, Notice } from '../ui/kit.js';
import { colors, fonts, radius, space } from '../ui/theme.js';
import { useWorkingCalendar } from '../ui/calendar.js';
import { PhotoAdder } from './PhotoAdder.js';
import { pickPhoto, type PickedPhoto } from './photoPicker.js';
import { SnaggingChoice } from './SnaggingChoice.js';

export interface RequestDetails {
  readonly preferredDate: string;
  readonly preferredSlot: VisitSlot;
  readonly description: string;
  readonly photos: readonly PickedPhoto[];
  /** O3 (ADR 0032): soft or professional, for snagging only. */
  readonly snaggingType?: SnaggingType;
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <View style={styles.section}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </View>
  );
}

export function RequestSheet(props: {
  service: ServiceView;
  /** "1204-J188 · J188": which home the request is for. */
  placeLabel: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSend: (details: RequestDetails) => void;
}): ReactNode {
  const [day, setDay] = useState<string | null>(null);
  const { t, locale } = useLang();
  const [slot, setSlot] = useState<VisitSlot | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const snagging = props.service.code === 'snagging';
  const [snaggingType, setSnaggingType] = useState<SnaggingType | null>(null);
  const days = preferredDays(dubaiDate(Date.now()), useWorkingCalendar());
  const text = description.trim();
  const ready = day !== null && slot !== null && text !== '' && (!snagging || snaggingType !== null);

  const addPhoto = async (source: 'camera' | 'library') => {
    const picked = await pickPhoto(source);
    if (picked !== null) setPhotos((p) => [...p, picked].slice(0, MAX_REQUEST_PHOTOS));
  };
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
                <Text style={styles.title}>{serviceName(props.service.code, props.service.name, t)}</Text>
                <Text style={styles.subtitle}>{props.placeLabel}</Text>
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
              {snagging ? <SnaggingChoice value={snaggingType} onChange={setSnaggingType} /> : null}
              <Section title={t('req.sheet.day')}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.row}
                >
                  {days.map((d) => (
                    <Choice
                      key={d}
                      compact
                      title={dayLabel(d, locale)}
                      selected={day === d}
                      onPress={() => {
                        setDay(d);
                      }}
                    />
                  ))}
                </ScrollView>
              </Section>
              <Section title={t('req.sheet.time')}>
                <View style={styles.row}>
                  {VISIT_SLOTS.map((s) => (
                    <View key={s.key} style={styles.third}>
                      <Choice
                        compact
                        title={visitSlotLabel(s.key, t)}
                        detail={s.hours}
                        selected={slot === s.key}
                        onPress={() => {
                          setSlot(s.key);
                        }}
                      />
                    </View>
                  ))}
                </View>
              </Section>
              <Field
                label={t('req.whatDoYouNeed')}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={2000}
              />
              <Section title={t('req.sheet.photos', { max: MAX_REQUEST_PHOTOS })}>
                <PhotoAdder
                  photos={photos}
                  max={MAX_REQUEST_PHOTOS}
                  onAdd={(source) => void addPhoto(source)}
                  onRemove={(photo) => {
                    setPhotos((all) => all.filter((x) => x !== photo));
                  }}
                />
              </Section>
              {props.error === null ? null : <Notice tone="error">{props.error}</Notice>}
              <Button
                title={t(
                  props.service.routing === 'partner' ? 'req.sheet.sendPartner' : 'req.sheet.sendTeam',
                )}
                busy={props.busy}
                disabled={!ready}
                onPress={() => {
                  if (day !== null && slot !== null && text !== '') {
                    props.onSend({
                      preferredDate: day,
                      preferredSlot: slot,
                      description: text,
                      photos,
                      ...(snaggingType === null ? {} : { snaggingType }),
                    });
                  }
                }}
              />
              {ready ? null : <Text style={styles.hint}>{t('req.sheet.hint')}</Text>}
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
  section: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  third: { flex: 1, minWidth: 96 },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
