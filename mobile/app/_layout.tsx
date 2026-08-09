import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ToastProvider } from '@/components';
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext';
import { queryClient } from '@/lib/query/client';

SplashScreen.preventAutoHideAsync().catch(() => {});

function SplashGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  useEffect(() => {
    // Only reveal the app once auth has been restored — no protected-screen
    // flash, no white flash.
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [status]);
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ToastProvider>
              <AuthProvider>
                <SplashGate>
                  <StatusBar style="auto" />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(app)" />
                  </Stack>
                </SplashGate>
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
