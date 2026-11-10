/**
 * Photos chosen on the phone before they are sent (ADR 0013): thumbnails that remove a photo when tapped, and
 * "Take photo" / "Choose photo" while fewer than `max` are chosen. Used for a new request and, by the
 * partner, for the finished work (ADR 0018).
 */
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../i18n/I18nProvider.js';
import { Button } from '../ui/kit.js';
import { colors, fonts, radius, space } from '../ui/theme.js';
import type { PickedPhoto } from './photoPicker.js';

export function PhotoAdder(props: {
  photos: readonly PickedPhoto[];
  max: number;
  onAdd: (source: 'camera' | 'library') => void;
  onRemove: (photo: PickedPhoto) => void;
}): ReactNode {
  const t = useT();
  return (
    <>
      {props.photos.length === 0 ? null : (
        <View style={styles.row}>
          {props.photos.map((p, i) => (
            <Pressable
              key={p.uri}
              accessibilityRole="button"
              accessibilityLabel={t('req.sheet.removePhoto', { number: i + 1 })}
              onPress={() => {
                props.onRemove(p);
              }}
            >
              <Image source={{ uri: p.uri }} style={styles.thumb} />
              <Text style={styles.remove}>{t('req.sheet.remove')}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {props.photos.length < props.max ? (
        <View style={styles.row}>
          <View style={styles.half}>
            <Button
              title={t('req.sheet.takePhoto')}
              kind="secondary"
              onPress={() => {
                props.onAdd('camera');
              }}
            />
          </View>
          <View style={styles.half}>
            <Button
              title={t('req.sheet.choosePhoto')}
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  half: { flex: 1, minWidth: 140 },
  thumb: { width: 96, height: 96, borderRadius: radius, backgroundColor: colors.backgroundAlt },
  remove: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.urgent,
    marginTop: 4,
  },
});
