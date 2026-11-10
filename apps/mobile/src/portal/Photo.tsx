/**
 * A photo from the owner's data: construction updates and offers, in a box of fixed size with the whole
 * photo fitted inside (never cropped). Real photos come through the API's owner file route (only files
 * Salesforce says this owner may see, sent with the session); demo photos and posts without photos use the
 * bundled project photo.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSessionController } from '../session/SessionProvider.js';
import { FittedPhoto, PHOTO_BOX_ASPECT, demoPhoto, projectPhoto } from '../ui/brand.js';
import { colors, radius } from '../ui/theme.js';

export function Photo(props: { id: string | null; project: string | null; label: string }): ReactNode {
  const { api } = useSessionController();
  const local = props.id === null ? projectPhoto(props.project) : demoPhoto(props.id);
  const source =
    local ??
    (props.id === null ? null : api.authorizedImage(`/api/owner/files/${encodeURIComponent(props.id)}`));
  if (source === null) return null;
  return (
    <View style={styles.frame}>
      <FittedPhoto source={source} label={props.label} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: PHOTO_BOX_ASPECT,
    borderRadius: radius,
    overflow: 'hidden',
    backgroundColor: colors.backgroundAlt,
  },
});
