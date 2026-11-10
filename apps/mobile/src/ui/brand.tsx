/** JAD+ brand pieces from apps/mobile/assets/brand (docs/DESIGN.md): logo and project hero under a slate veil. */
import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import logoCream from '../../assets/brand/logo/jadplus-cream.png';
import logoInk from '../../assets/brand/logo/jadplus-ink.png';
import samplePlan from '../../assets/brand/demo/floor-plan.png';
import signinPoster from '../../assets/brand/media/signin-poster.jpg';
// Wide versions cut to the building (made from the portrait originals with ImageMagick, sky and road trimmed),
// so the building fills the box instead of shrinking to a thumbnail (Naya, 10-Nov-2026).
import photo171 from '../../assets/brand/projects/wide/171gh.jpg';
import photoJ188 from '../../assets/brand/projects/wide/j188.jpg';
import photoJad288 from '../../assets/brand/projects/wide/jad288.jpg';
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

/** Demo ids point at bundled images: "demo-photo-j188" a project photo, "demo-plan-…" the sample floor plan. */
export function demoPhoto(id: string): number | null {
  if (id.startsWith('demo-plan-')) return samplePlan;
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

/** Height of the photo box with the title on it (the size Naya approved; the photo is fitted inside). */
export const HERO_HEIGHT = 220;
/** Width ÷ height of the box for other photos (news, construction). */
export const PHOTO_BOX_ASPECT = 16 / 10;

/**
 * A photo inside a box of fixed size. Bundled project photos are already cut to the box's shape, so they
 * fill it ("fill"). Photos of unknown shape (from Salesforce) are fitted whole inside ("fit"), with a soft
 * blurred copy of the same photo filling the rest of the box.
 */
export function FittedPhoto(props: {
  source: ImageSourcePropType;
  label?: string;
  /** fill: cover the box; fit: whole photo over a blurred copy; plain: whole image on paper (plans). */
  mode?: 'fill' | 'fit' | 'plain';
}): ReactNode {
  if (props.mode === 'plain') {
    return (
      <Image
        source={props.source}
        style={[StyleSheet.absoluteFill, styles.plain]}
        resizeMode="contain"
        accessibilityLabel={props.label}
      />
    );
  }
  if (props.mode !== 'fit') {
    return (
      <Image
        source={props.source}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityLabel={props.label}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <>
      <Image source={props.source} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={24} />
      <Image
        source={props.source}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        accessibilityLabel={props.label}
        accessibilityIgnoresInvertColors
      />
    </>
  );
}

/** A photo box with a slate veil, the logo, a bronze eyebrow and a title (sign-in, home, my unit). */
export function Hero(props: { project?: string | null; eyebrow: string; title: string }): ReactNode {
  const key = projectKey(props.project ?? null);
  return (
    <View style={styles.hero}>
      <FittedPhoto source={key === null ? signinPoster : PROJECT_PHOTOS[key]} />
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
  plain: { backgroundColor: colors.card },
  logo: { width: 134, height: 23 },
  hero: { height: HERO_HEIGHT, borderRadius: radius, overflow: 'hidden', backgroundColor: colors.slate },
  veil: {
    flex: 1,
    justifyContent: 'space-between',
    padding: space.lg,
    // Lighter veil than before, so the fitted photo stays visible behind the title.
    backgroundColor: 'rgba(57,69,81,0.38)',
  },
  heroText: { gap: space.xs },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 2.4, color: colors.bronzeSoft },
  title: { fontFamily: fonts.light, fontSize: 30, letterSpacing: -0.6, color: colors.onNavy },
});
