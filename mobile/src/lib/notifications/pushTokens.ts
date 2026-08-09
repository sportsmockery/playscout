import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { registerPushToken, deletePushToken } from '@/lib/api/endpoints';

let currentToken: string | null = null;

/**
 * Registers this device for processing/analysis-complete pushes. Requires an
 * authenticated session (the API attaches it to the user). No-op on simulators.
 * Notification content is intentionally generic on the lock screen — the server
 * omits player names and findings by default (see push privacy rules).
 */
export async function registerForPushNotifications(): Promise<{ granted: boolean }> {
  if (!Device.isDevice) return { granted: false };

  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return { granted: false };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'PlayScout',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync();
    currentToken = data;
    await registerPushToken({ token: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    return { granted: true };
  } catch {
    return { granted: false };
  }
}

/** Detach this device's token so old pushes go stale after sign-out/deletion. */
export async function unregisterCurrentPushToken(): Promise<void> {
  if (!currentToken) return;
  const token = currentToken;
  currentToken = null;
  await deletePushToken(token).catch(() => {});
}
