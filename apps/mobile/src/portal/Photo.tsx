/**
 * A photo from the owner's data: construction updates and offers. Real photos come through the API's owner
 * file route (only files Salesforce says this owner may see, sent with the session); demo photos and posts
 * without photos use the bundled project photo.
 */
import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSessionController } from '../session/SessionProvider.js';
import { PHOTO_SHAPES, demoPhoto, projectPhoto, type PhotoShape } from '../ui/brand.js';
import { colors, radius } from '../ui/theme.js';

export function Photo(props: {
  id: string | null;
  project: string | null;
  shape?: PhotoShape;
  label: string;
}): ReactNode {
  const { api } = useSessionController();
  const local = props.id === null ? projectPhoto(props.project) : (demoPhoto(props.id) ?? null);
  const source =
    local ??
    (props.id === null ? null : api.authorizedImage(`/api/owner/files/${encodeURIComponent(props.id)}`));
  if (source === null) return null;
  return (
    <View style={[styles.frame, { aspectRatio: PHOTO_SHAPES[props.shape ?? 'landscape'] }]}>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityLabel={props.label}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius, overflow: 'hidden', backgroundColor: colors.backgroundAlt },
});
