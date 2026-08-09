import Constants from 'expo-constants';

/**
 * Runtime configuration, validated once at startup. Only public values — no
 * secrets ever reach the bundle. Missing required values fail loudly in dev.
 */
function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    if (__DEV__) {
      console.error(`Missing required env var ${name}. Set it in .env / EAS.`);
    }
    return '';
  }
  return value.trim();
}

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const config = {
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'https://playscout.ai').replace(/\/$/, ''),
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? extra.sentryDsn ?? '',
} as const;

export const isConfigured = config.supabaseUrl !== '' && config.supabaseAnonKey !== '';
