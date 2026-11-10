/**
 * A photo from the owner's data: construction updates and offers. The frame takes the photo's own
 * proportions so the whole photo is shown, never cropped. Real photos come through the API's owner file route
 * (only files Salesforce says this owner may see, sent with the session); demo photos and posts without
 * photos use the bundled project photo.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSessionController } from '../session/SessionProvider.js';
import { demoPhoto, naturalAspect, projectPhoto } from '../ui/brand.js';
import { colors, radius } from '../ui/theme.js';

/** Until a downloaded photo's size is known, its frame is 4:3 and the photo fits inside it. */
const DEFAULT_ASPECT = 4 / 3;

export function Photo(props: { id: string | null; project: string | null; label: string }): ReactNode {
  const { api } = useSessionController();
  const local = props.id === null ? projectPhoto(props.project) : demoPhoto(props.id);
  const remote =
    local !== null || props.id === null
      ? null
      : api.authorizedImage(`/api/owner/files/${encodeURIComponent(props.id)}`);
  const [remoteAspect, setRemoteAspect] = useState(DEFAULT_ASPECT);
  // Plain values, so the photo is measured once per photo (not on every render).
  const uri = remote?.uri ?? null;
  const authorization = remote?.headers.authorization ?? null;
  useEffect(() => {
    if (uri === null) return;
    const headers: Record<string, string> = authorization === null ? {} : { authorization };
    Image.getSizeWithHeaders(uri, headers, (width, height) => {
      if (width > 0 && height > 0) setRemoteAspect(width / height);
    });
  }, [uri, authorization]);
  if (local === null && remote === null) return null;
  const aspect = local === null ? remoteAspect : naturalAspect(local);
  return (
    <View style={[styles.frame, { aspectRatio: aspect }]}>
      <Image
        source={local ?? remote ?? undefined}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        accessibilityLabel={props.label}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: radius, overflow: 'hidden', backgroundColor: colors.backgroundAlt },
});
