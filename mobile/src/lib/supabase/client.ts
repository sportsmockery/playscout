import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { config } from '@/lib/config';
import { SecureStorageAdapter } from './secureStorage';

/**
 * The mobile Supabase client — anon key + on-device user session only, exactly
 * like the web browser client. The session persists in the OS keychain via the
 * chunked SecureStore adapter and auto-refreshes while the app is foregrounded.
 */
/**
 * `createClient` throws on an empty URL, and this module is imported from the
 * root layout — so a build that shipped without its public env would die at
 * import with a stack trace and no UI. A build like that should never leave EAS
 * (app.config.ts fails it), but if one does, the app must be able to render the
 * screen that explains why. Falling back to a syntactically valid placeholder
 * keeps construction total; `isConfigured` is what gates real use.
 */
const PLACEHOLDER_URL = 'https://unconfigured.invalid';

export const supabase = createClient(
  config.supabaseUrl || PLACEHOLDER_URL,
  config.supabaseAnonKey || 'unconfigured',
  {
    auth: {
      storage: SecureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Supabase recommends pausing auto-refresh when the app is backgrounded and
// resuming on foreground, so refresh timers don't fire while suspended.
let appStateSubscribed = false;
export function registerSupabaseAppStateRefresh() {
  if (appStateSubscribed) return;
  appStateSubscribed = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
