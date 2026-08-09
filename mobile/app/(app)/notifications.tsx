import React, { useEffect, useState } from 'react';
import { View, Switch, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Screen, TopBar, Text, Card, Section, Row, useToast } from '@/components';
import { registerForPushNotifications } from '@/lib/notifications/pushTokens';
import { config } from '@/lib/config';

/**
 * Notification preferences. Reflects the OS permission truthfully — we can’t
 * turn pushes on without it, so we route to system settings rather than showing
 * a toggle that lies.
 */
export default function NotificationsScreen() {
  const toast = useToast();
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync().then((s) => setGranted(s.status === 'granted'));
  }, []);

  async function onToggle(next: boolean) {
    if (next) {
      const res = await registerForPushNotifications();
      setGranted(res.granted);
      if (!res.granted) {
        toast('Enable notifications in system settings', 'error');
        Linking.openSettings().catch(() => {});
      }
    } else {
      // Can’t revoke programmatically — send the user to settings.
      Linking.openSettings().catch(() => {});
    }
  }

  return (
    <>
      <TopBar title="Notifications" />
      <Screen>
        <Section title="Push notifications" style={{ marginTop: 12 }}>
          <Card>
            <Row justify="space-between">
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text role="label">Processing & analysis updates</Text>
                <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                  Get notified when film finishes processing, plays are ready to confirm, or an
                  analysis or scout report is complete.
                </Text>
              </View>
              <Switch value={granted === true} onValueChange={onToggle} />
            </Row>
          </Card>
          <Text role="metadata" color="textSecondary" style={{ marginTop: 10 }}>
            Lock-screen alerts avoid player names and sensitive findings. Open the app to see
            details.
          </Text>
        </Section>

        <Section title="Privacy">
          <Card>
            <Text role="body" color="textSecondary">
              PlayScout never logs chat contents, frames, report bodies, or signed media links.
            </Text>
            <Text
              role="label"
              color="gold"
              style={{ marginTop: 10 }}
              onPress={() => Linking.openURL(`${config.apiUrl}/privacy`).catch(() => {})}
            >
              Read the Privacy Policy
            </Text>
          </Card>
        </Section>
      </Screen>
    </>
  );
}
