/**
 * JAD+ look (docs/DESIGN.md, decided by Naya 10-Nov-2026): the owner portal prototype's warm cream, slate,
 * night navy and bronze, with Hanken Grotesk. Calm: generous space, soft edges, nothing shouts, except the
 * emergency red, which must stand out.
 */
export const colors = {
  /** App background (cream). */
  background: '#F4F0EB',
  backgroundAlt: '#EAE4DB',
  /** Cards (paper). */
  card: '#FBF9F6',
  /** Primary buttons, links. */
  slate: '#394551',
  slatePressed: '#4B5867',
  /** Headings, darkest navy (night). */
  navy: '#000229',
  bronze: '#937831',
  bronzeSoft: '#C9B278',
  mist: '#D2DEE8',
  /** Unread notifications: a lighter mist. */
  mistSoft: '#EDF2F6',
  /** Body text (ink) and secondary text. */
  text: '#1B1F26',
  textSecondary: '#4A525C',
  muted: '#7A818A',
  line: 'rgba(57,69,81,0.12)',
  ok: '#4E7A5E',
  okSoft: '#E5EEE7',
  warn: '#9A6B1F',
  warnSoft: '#F4EAD6',
  /** Emergency red: deliberately stronger than the calm palette's "bad" tone. */
  urgent: '#B42318',
  urgentSoft: '#F5E3DE',
  /** Text on slate, navy or photos. */
  onNavy: '#F4F0EB',
} as const;

/** Hanken Grotesk weights, loaded in app/_layout.tsx (font family names from @expo-google-fonts). */
export const fonts = {
  light: 'HankenGrotesk_300Light',
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Card corners (14) and button corners (6). */
export const radius = 14;
export const buttonRadius = 6;

/** Soft shadow under cards: 0 12 32 -12 rgba(0,2,41,.12). */
export const cardShadow = {
  shadowColor: '#000229',
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 12 },
  elevation: 3,
} as const;
