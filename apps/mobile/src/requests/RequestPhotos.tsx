/**
 * The photos added to a request (ADR 0013), shown to everyone allowed to see the request. Each is fetched
 * through the API with the session; the files themselves are never public.
 */
import type { ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useSessionController } from '../session/SessionProvider.js';
import { Eyebrow } from '../ui/kit.js';
import { colors, radius, space } from '../ui/theme.js';

export function RequestPhotos({
  requestId,
  photos,
}: {
  requestId: string;
  photos: readonly { id: string }[];
}): ReactNode {
  const { api } = useSessionController();
  if (photos.length === 0) return null;
  return (
    <View style={styles.box}>
      <Eyebrow>Photos</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {photos.map((p, i) => (
          <Image
            key={p.id}
            source={api.authorizedImage(
              `/api/requests/${encodeURIComponent(requestId)}/photos/${encodeURIComponent(p.id)}`,
            )}
            style={styles.photo}
            resizeMode="cover"
            accessibilityLabel={`Photo ${String(i + 1)} of the request`}
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
