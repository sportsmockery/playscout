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
export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: SecureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

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
