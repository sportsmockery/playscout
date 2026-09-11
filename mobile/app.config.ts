import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Values the app cannot start without. They are public (the same two ship in
 * the web bundle), but they only reach a build if EAS is given them — `.env` is
 * gitignored and never reaches EAS's builders.
 *
 * Without this check a build SUCCEEDS and the binary dies on the splash screen,
 * because `createClient('', '')` throws at module load. Failing here instead
 * costs a build; failing there costs a TestFlight round trip.
 */
const REQUIRED_PUBLIC_ENV = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
] as const;

if (process.env.EAS_BUILD === 'true') {
  const missing = REQUIRED_PUBLIC_ENV.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Cannot build PlayScout mobile: ${missing.join(', ')} not set.\n` +
        'Set them on the EAS project (eas env:create) or in eas.json > build > ' +
        '<profile> > env. They are public values, not secrets.',
    );
  }
}

/**
 * The EAS project this app builds under. `eas init` writes EAS_PROJECT_ID into
 * the project's env; it cannot edit this file because the config is TypeScript.
 * Left undefined when unset so EAS says "run eas init" instead of chasing a
 * placeholder UUID that looks real and resolves to nothing.
 */
const easProjectId = process.env.EAS_PROJECT_ID?.trim() || undefined;
const easOwner = process.env.EAS_OWNER?.trim() || undefined;

/**
 * PlayScout mobile app configuration.
 *
 * Public config only — every value here ships in the client bundle. Secrets
 * (service-role key, AI provider keys, worker secrets) must NEVER appear here
 * or in any EXPO_PUBLIC_* variable. See .env.example for the allowed set.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'PlayScout',
  slug: 'playscout',
  scheme: 'playscout',
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  newArchEnabled: true,
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#080D16',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'ai.playscout.mobile',
    // Declared so Apple does not hold every build at export compliance.
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSCameraUsageDescription:
        'PlayScout uses the camera so coaches can capture game and practice film.',
      NSPhotoLibraryUsageDescription:
        'PlayScout accesses your library so you can upload existing game film.',
      NSMicrophoneUsageDescription:
        'PlayScout records audio with captured film.',
    },
  },
  android: {
    package: 'ai.playscout.mobile',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#080D16',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-video',
    [
      'expo-image-picker',
      {
        photosPermission:
          'PlayScout accesses your library so you can upload existing game film.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'PlayScout uses the camera so coaches can capture game and practice film.',
      },
    ],
    [
      'expo-notifications',
      { icon: './assets/notification-icon.png', color: '#B8942F' },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#080D16',
        dark: { backgroundColor: '#080D16' },
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    router: { origin: false },
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
  ...(easOwner ? { owner: easOwner } : {}),
});
