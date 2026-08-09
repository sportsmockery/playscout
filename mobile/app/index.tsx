import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';

/** Entry gate — routes to the app or auth once the session is restored. */
export default function Index() {
  const { status } = useAuth();
  const theme = useTheme();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.gold} />
      </View>
    );
  }
  return <Redirect href={status === 'signedIn' ? '/(app)/(tabs)/home' : '/(auth)/sign-in'} />;
}
