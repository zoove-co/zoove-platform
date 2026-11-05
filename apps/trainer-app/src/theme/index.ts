// Single source of truth for the look of the app (decision D10).
// Values come from Pratik's "Expressive Canvas" prototype v1. To change the visual
// direction, change this file only; screens must never hard-code colours, sizes or fonts.

export const colors = {
  white: '#FFFFFF',
  background: '#FFFFFF',
  ink: '#080B0F',
  muted: 'rgba(8, 11, 15, 0.58)',
  purple: '#4B18F8', // primary actions
  magenta: '#C900D8', // accents, unread dots, highlights
  supportingPurple: '#682A7A',
  lavender: '#E8D9FF', // soft surfaces
  line: 'rgba(232, 217, 255, 0.58)', // hairline borders
  overlay: 'rgba(0, 0, 0, 0.63)', // gradient over photos
  success: '#1F9D55',
  danger: '#D92D20',
} as const;

export const radius = {
  sm: 11,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 30,
  pill: 999,
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

// Font family names match the files loaded in the root layout (@expo-google-fonts).
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  wordmark: 'Kalam_700Bold', // stand-in for the iOS-only Noteworthy used in the prototype
} as const;

// Type scale taken from the prototype (sizes in points).
export const typography = {
  screenTitle: { fontFamily: fonts.semibold, fontSize: 30 },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 20 },
  heading: { fontFamily: fonts.semibold, fontSize: 17 },
  body: { fontFamily: fonts.regular, fontSize: 13 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 13 },
  caption: { fontFamily: fonts.regular, fontSize: 11 },
  micro: { fontFamily: fonts.medium, fontSize: 10 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.4 },
  price: { fontFamily: fonts.bold, fontSize: 18 },
} as const;

export const theme = { colors, radius, spacing, fonts, typography } as const;
export type Theme = typeof theme;
