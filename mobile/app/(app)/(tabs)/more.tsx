import React, { useState } from 'react';
import { View, Pressable, Linking, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Screen, TopBar, Text, Section, Card, ConfirmationSheet, useToast } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { ROLE_LABELS } from '@/utils/roles';
import { config } from '@/lib/config';

const appVersion = `v${Constants.expoConfig?.version ?? '0.1.0'}`;

export default function MoreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { user, signOut } = useAuth();
  const { activeTeam } = useTeamStore();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const items: { label: string; onPress: () => void; note?: string }[] = [
    { label: 'Roster', onPress: () => router.push('/(app)/roster') },
    { label: 'Opponents', onPress: () => router.push('/(app)/(tabs)/analyze') },
    { label: 'Notifications', onPress: () => router.push('/(app)/notifications') },
    { label: 'Team settings', onPress: () => openWeb(`/teams/${activeTeam?.id ?? ''}/settings`), note: 'Opens on the web' },
  ];

  const legal: { label: string; onPress: () => void }[] = [
    { label: 'Privacy Policy', onPress: () => openWeb('/privacy') },
    { label: 'Terms', onPress: () => openWeb('/terms') },
    { label: 'Help', onPress: () => openWeb('/about') },
  ];

  function openWeb(path: string) {
    Linking.openURL(`${config.apiUrl}${path}`).catch(() => toast('Could not open link', 'error'));
  }

  return (
    <>
      <TopBar title="More" />
      <Screen>
        <Section title="Account" style={{ marginTop: 12 }}>
          <Card>
            <Text role="label">{user?.email ?? 'Signed in'}</Text>
            {activeTeam?.role ? (
              <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                {ROLE_LABELS[activeTeam.role]} on {activeTeam.name}
              </Text>
            ) : null}
          </Card>
        </Section>

        <Section title="Team">
          <Card style={{ paddingVertical: 4 }}>
            {items.map((it, i) => (
              <MoreRow key={it.label} {...it} last={i === items.length - 1} />
            ))}
          </Card>
        </Section>

        <Section title="About">
          <Card style={{ paddingVertical: 4 }}>
            {legal.map((it, i) => (
              <MoreRow key={it.label} {...it} last={i === legal.length - 1} />
            ))}
          </Card>
        </Section>

        <Section title="Account actions">
          <Card style={{ paddingVertical: 4 }}>
            <MoreRow label="Delete account" onPress={() => router.push('/(app)/settings')} note="Permanent" last />
          </Card>
          <View style={{ height: 12 }} />
          <Pressable onPress={() => setConfirmSignOut(true)} style={styles.signOut}>
            <Text role="label" style={{ color: theme.colors.error }}>
              Sign out
            </Text>
          </Pressable>
        </Section>

        <Text role="metadata" color="textSecondary" align="center" style={{ marginTop: 24 }}>
          PlayScout {appVersion}
        </Text>
      </Screen>

      <ConfirmationSheet
        visible={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title="Sign out of PlayScout?"
        message="You’ll need your email code to sign back in. In-progress uploads on this device will be cleared."
        confirmLabel="Sign out"
        destructive
        onConfirm={() => {
          signOut();
          router.replace('/(auth)/sign-in');
        }}
      />
    </>
  );
}

function MoreRow({ label, onPress, note, last }: { label: string; onPress: () => void; note?: string; last?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, { borderBottomColor: theme.colors.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth }]}
    >
      <Text role="body">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {note ? (
          <Text role="metadata" color="textSecondary">
            {note}
          </Text>
        ) : null}
        <Text style={{ color: theme.colors.textSecondary, fontSize: 18 }}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4 },
  signOut: { alignItems: 'center', paddingVertical: 14 },
});
