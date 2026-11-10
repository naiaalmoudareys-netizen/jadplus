/**
 * The pop-up that opens when the owner taps a service (Naya, 10-Nov-2026: "a pop up menu shows where he picks
 * the date the time and adds image and writing rather than having to scroll all the way down"). It slides up
 * from the bottom with the chosen unit and service, the day, the time window, the description and up to 3
 * photos (ADR 0013), and the Send button.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  DEFAULT_CALENDAR,
  MAX_REQUEST_PHOTOS,
  VISIT_SLOTS,
  dubaiDate,
  preferredDays,
  type ServiceView,
  type VisitSlot,
} from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import {
  Image,
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
import { Choice } from '../ui/Choice.js';
import { Button, Eyebrow, Field, Notice } from '../ui/kit.js';
import { colors, fonts, radius, space } from '../ui/theme.js';
import { pickPhoto, type PickedPhoto } from './photoPicker.js';

export interface RequestDetails {
  readonly preferredDate: string;
  readonly preferredSlot: VisitSlot;
  readonly description: string;
  readonly photos: readonly PickedPhoto[];
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <View style={styles.section}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </View>
  );
}

function Photos(props: {
  photos: readonly PickedPhoto[];
  onAdd: (source: 'camera' | 'library') => void;
  onRemove: (photo: PickedPhoto) => void;
}): ReactNode {
  return (
    <>
      {props.photos.length === 0 ? null : (
        <View style={styles.row}>
          {props.photos.map((p, i) => (
            <Pressable
              key={p.uri}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${String(i + 1)}`}
              onPress={() => {
                props.onRemove(p);
              }}
            >
              <Image source={{ uri: p.uri }} style={styles.thumb} />
              <Text style={styles.remove}>REMOVE</Text>
            </Pressable>
          ))}
        </View>
      )}
      {props.photos.length < MAX_REQUEST_PHOTOS ? (
        <View style={styles.row}>
          <View style={styles.half}>
            <Button
              title="Take photo"
              kind="secondary"
              onPress={() => {
                props.onAdd('camera');
              }}
            />
          </View>
          <View style={styles.half}>
            <Button
              title="Choose photo"
              kind="secondary"
              onPress={() => {
                props.onAdd('library');
              }}
            />
          </View>
        </View>
      ) : null}
    </>
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
  const { locale } = useLang();
  const [slot, setSlot] = useState<VisitSlot | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const days = preferredDays(dubaiDate(Date.now()), DEFAULT_CALENDAR);
  const text = description.trim();
  const ready = day !== null && slot !== null && text !== '';

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
        <Pressable accessibilityLabel="Close" style={styles.dismiss} onPress={close} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{props.service.name}</Text>
                <Text style={styles.subtitle}>{props.placeLabel}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={close}>
                <Ionicons name="close" size={26} color={colors.slate} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <Section title="Which day suits you?">
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
              <Section title="What time?">
                <View style={styles.row}>
                  {VISIT_SLOTS.map((s) => (
                    <View key={s.key} style={styles.third}>
                      <Choice
                        compact
                        title={s.label}
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
                label="What do you need?"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={2000}
              />
              <Section title={`Photos (optional, up to ${String(MAX_REQUEST_PHOTOS)})`}>
                <Photos
                  photos={photos}
                  onAdd={(source) => void addPhoto(source)}
                  onRemove={(photo) => {
                    setPhotos((all) => all.filter((x) => x !== photo));
                  }}
                />
              </Section>
              {props.error === null ? null : <Notice tone="error">{props.error}</Notice>}
              <Button
                title={`Send to ${props.service.routing === 'partner' ? 'our partner' : 'the JAD+ team'}`}
                busy={props.busy}
                disabled={!ready}
                onPress={() => {
                  if (day !== null && slot !== null && text !== '') {
                    props.onSend({ preferredDate: day, preferredSlot: slot, description: text, photos });
                  }
                }}
              />
              {ready ? null : (
                <Text style={styles.hint}>Choose a day and a time, and describe what you need.</Text>
              )}
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
  half: { flex: 1, minWidth: 140 },
  third: { flex: 1, minWidth: 96 },
  thumb: { width: 96, height: 96, borderRadius: radius, backgroundColor: colors.backgroundAlt },
  remove: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.urgent,
    marginTop: 4,
  },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
