/** JAD+ brand pieces from apps/mobile/assets/brand (docs/DESIGN.md): logo and project hero under a slate veil. */
import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import logoCream from '../../assets/brand/logo/jadplus-cream.png';
import logoInk from '../../assets/brand/logo/jadplus-ink.png';
import signinPoster from '../../assets/brand/media/signin-poster.jpg';
import photo171 from '../../assets/brand/projects/171gh.jpg';
import photoJ188 from '../../assets/brand/projects/j188.jpg';
import photoJad288 from '../../assets/brand/projects/jad288.jpg';
import { projectKey, type ProjectKey } from '../brand/projects.js';
import { colors, fonts, radius, space } from './theme.js';

const PROJECT_PHOTOS: Readonly<Record<ProjectKey, number>> = {
  j188: photoJ188,
  jad288: photoJad288,
  '171gh': photo171,
};

/** The bundled photo of a project, or null when it has none. */
export function projectPhoto(project: string | null): number | null {
  const key = projectKey(project);
  return key === null ? null : PROJECT_PHOTOS[key];
}

/** Demo photo ids ("demo-photo-j188") point at the bundled project photos. */
export function demoPhoto(id: string): number | null {
  return id.startsWith('demo-photo-') ? projectPhoto(id.slice('demo-photo-'.length)) : null;
}

/** The JAD+ wordmark (268 x 46), ink on light backgrounds, cream on photos. */
export function Logo({ onPhoto = false }: { onPhoto?: boolean }): ReactNode {
  return (
    <Image
      source={onPhoto ? logoCream : logoInk}
      style={styles.logo}
      resizeMode="contain"
      accessibilityLabel="JAD+"
    />
  );
}

/**
 * Frame shapes for photos. Project photos are tall towers, so the taller frames show the whole building
 * instead of a cropped strip (Naya, 10-Nov-2026: "too zoomed in").
 */
export const PHOTO_SHAPES = { banner: 16 / 10, landscape: 4 / 3, portrait: 3 / 4 } as const;
export type PhotoShape = keyof typeof PHOTO_SHAPES;

/** A photo with a slate veil, the logo, a bronze eyebrow and a title (sign-in, owner home, my unit). */
export function Hero(props: {
  project?: string | null;
  eyebrow: string;
  title: string;
  shape?: PhotoShape;
}): ReactNode {
  const key = projectKey(props.project ?? null);
  return (
    <View style={[styles.hero, { aspectRatio: PHOTO_SHAPES[props.shape ?? 'banner'] }]}>
      <Image
        source={key === null ? signinPoster : PROJECT_PHOTOS[key]}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <View style={styles.veil}>
        <Logo onPhoto />
        <View style={styles.heroText}>
          <Text style={styles.eyebrow}>{props.eyebrow.toUpperCase()}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {props.title.toUpperCase()}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 134, height: 23 },
  hero: { minHeight: 200, borderRadius: radius, overflow: 'hidden' },
  veil: {
    flex: 1,
    justifyContent: 'space-between',
    padding: space.lg,
    backgroundColor: 'rgba(57,69,81,0.55)',
  },
  heroText: { gap: space.xs },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 2.4, color: colors.bronzeSoft },
  title: { fontFamily: fonts.light, fontSize: 30, letterSpacing: -0.6, color: colors.onNavy },
});
