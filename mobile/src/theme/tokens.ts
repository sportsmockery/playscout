/**
 * PlayScout design tokens — "film room, reduced to its essentials."
 *
 * Semantic palette from the mobile build spec. Gold is an accent for
 * selection, emphasis, and brand moments — never body text on white, never a
 * universal border. Both themes are first-class: field use in daylight makes a
 * usable light theme mandatory.
 */

export const palette = {
  brandNavy: '#0F1D35',
  brandBlue: '#315AD7',
  brandGold: '#B8942F',
  brandGoldLight: '#D6B85A',

  success: '#2F855A',
  warning: '#B7791F',
  error: '#C2414F',
  info: '#2F6FED',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export interface ColorScheme {
  background: string;
  surface: string;
  elevated: string;
  text: string;
  textSecondary: string;
  border: string;

  /** Brand + semantic (shared across themes but exposed here for one import site). */
  navy: string;
  blue: string;
  gold: string;
  goldLight: string;
  success: string;
  warning: string;
  error: string;
  info: string;

  /** Tint used behind primary buttons / active tab. */
  primary: string;
  onPrimary: string;
  /** Low-emphasis fill (chips, skeletons, pressed states). */
  fill: string;
  /** Overlay/scrim behind sheets. */
  scrim: string;
}

export const lightColors: ColorScheme = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  elevated: '#EEF1F5',
  text: '#0D1728',
  textSecondary: '#596579',
  border: '#DCE1E8',

  navy: palette.brandNavy,
  blue: palette.brandBlue,
  gold: palette.brandGold,
  goldLight: palette.brandGoldLight,
  success: palette.success,
  warning: palette.warning,
  error: palette.error,
  info: palette.info,

  primary: palette.brandNavy,
  onPrimary: '#FFFFFF',
  fill: '#EEF1F5',
  scrim: 'rgba(13, 23, 40, 0.45)',
};

export const darkColors: ColorScheme = {
  background: '#080D16',
  surface: '#101827',
  elevated: '#172236',
  text: '#F3F6FA',
  textSecondary: '#9DA9BA',
  border: '#28364A',

  navy: palette.brandNavy,
  blue: palette.brandBlue,
  gold: palette.brandGold,
  goldLight: palette.brandGoldLight,
  success: '#48A47A',
  warning: '#D6A143',
  error: '#E06B77',
  info: '#5A8CF0',

  primary: '#1B2C4C',
  onPrimary: '#FFFFFF',
  fill: '#172236',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

/** 4-point spacing grid. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  gutter: 16,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/**
 * Five type roles only. Sizes are unscaled bases; Dynamic Type / Android font
 * scaling is applied by the platform because we never disable it.
 */
export const typography = {
  screenTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: 0.2 },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, letterSpacing: 0.1 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' as const },
  metadata: { fontSize: 13, lineHeight: 17, fontWeight: '500' as const },
} as const;

/** Minimum hit targets: 44pt iOS / 48dp Android. We use the larger everywhere. */
export const hitTarget = 48;

export type TypographyRole = keyof typeof typography;
