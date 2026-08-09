import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen, ErrorState } from '@/components';
import { useBootstrap } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { registerForPushNotifications } from '@/lib/notifications/pushTokens';
import { UploadRunner } from '@/features/uploads/UploadRunner';

/**
 * Protected app group. Guards on auth, loads the bootstrap payload, and ensures
 * an active team is selected before any team-scoped screen renders.
 */
export default function AppLayout() {
  const { status } = useAuth();
  const theme = useTheme();
  const bootstrap = useBootstrap();
  const { activeTeam, setActiveTeam } = useTeamStore();

  // Seed the active team from bootstrap when none is persisted (or the persisted
  // one is no longer accessible).
  useEffect(() => {
    if (!bootstrap.data) return;
    const teams = bootstrap.data.teams;
    const stillValid = activeTeam && teams.some((t) => t.id === activeTeam.id);
    if (!stillValid) {
      const first = teams[0];
      setActiveTeam(
        first
          ? { id: first.id, name: first.name, ageGroup: first.age_group, level: first.level, role: first.role }
          : null,
      );
    }
  }, [bootstrap.data, activeTeam, setActiveTeam]);

  // Register for push once authenticated (permission prompt handled inside).
  useEffect(() => {
    if (status === 'signedIn') registerForPushNotifications().catch(() => {});
  }, [status]);

  if (status === 'signedOut') return <Redirect href="/(auth)/sign-in" />;

  if (bootstrap.isLoading || status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.gold} />
      </View>
    );
  }

  if (bootstrap.isError) {
    return (
      <Screen>
        <ErrorState message="We couldn’t load your teams. Check your connection." onRetry={() => bootstrap.refetch()} />
      </Screen>
    );
  }

  return (
    <>
      <UploadRunner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="team-picker" options={{ presentation: 'modal' }} />
        <Stack.Screen name="upload" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
