import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, TopBar, Text, Card, Section, Button, ConfirmationSheet, useToast } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/lib/auth/AuthContext';
import { deleteAccount } from '@/lib/api/endpoints';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { user, signOut } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    setDeleting(true);
    try {
      await deleteAccount();
      toast('Account deleted', 'success');
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch {
      toast('Could not delete account. Contact support.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <TopBar title="Account" />
      <Screen>
        <Section title="Signed in as" style={{ marginTop: 12 }}>
          <Card>
            <Text role="label">{user?.email ?? '—'}</Text>
          </Card>
        </Section>

        <Section title="Delete account">
          <Card style={{ borderColor: theme.colors.error }}>
            <Text role="body" color="textSecondary">
              Deleting your account is permanent. It removes your sign-in, your organization
              membership, team access, and this device’s notification tokens. Film and reports
              owned by your organization are not deleted by this action.
            </Text>
            <View style={{ marginTop: 16 }}>
              <Button label="Delete my account" variant="destructive" haptic={null} onPress={() => setConfirm(true)} />
            </View>
          </Card>
        </Section>
      </Screen>

      <ConfirmationSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Delete your account?"
        message="This can’t be undone. You’ll be signed out immediately."
        confirmLabel={deleting ? 'Deleting…' : 'Delete permanently'}
        destructive
        onConfirm={onDelete}
      />
    </>
  );
}
