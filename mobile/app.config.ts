import type { ExpoConfig, ConfigContext } from 'expo/config';

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
    eas: { projectId: '00000000-0000-0000-0000-000000000000' },
  },
  owner: 'playscout',
});
