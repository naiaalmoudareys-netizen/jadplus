/**
 * The photos added to a request (ADR 0013), shown to everyone allowed to see the request. Each is fetched
 * through the API with the session; the files themselves are never public. Also the finished-work photos.
 */
import type { ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Eyebrow } from '../ui/kit.js';
import { colors, radius, space } from '../ui/theme.js';

export function RequestPhotos({
  requestId,
  photos,
  title,
}: {
  requestId: string;
  photos: readonly { id: string }[];
  /** Defaults to "Photos"; "Finished work" for the partner's photos (ADR 0018). */
  title?: string;
}): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  if (photos.length === 0) return null;
  return (
    <View style={styles.box}>
      <Eyebrow>{title ?? t('req.photos')}</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {photos.map((p, i) => (
          <Image
            key={p.id}
            source={api.authorizedImage(
              `/api/requests/${encodeURIComponent(requestId)}/photos/${encodeURIComponent(p.id)}`,
            )}
            style={styles.photo}
            resizeMode="cover"
            accessibilityLabel={t('req.photoOf', { number: i + 1 })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  row: { gap: space.sm },
  photo: { width: 160, height: 160, borderRadius: radius, backgroundColor: colors.backgroundAlt },
});
