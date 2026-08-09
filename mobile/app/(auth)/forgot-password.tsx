import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button } from '@/components';

/**
 * PlayScout uses passwordless email one-time codes, so there is no password to
 * reset. This screen explains that and routes back to sign-in — kept as a real
 * destination for any "forgot password" deep link rather than a dead end.
 */
export default function ForgotPassword() {
  const router = useRouter();
  return (
    <Screen>
      <View style={{ marginTop: 64 }}>
        <Text role="screenTitle">No password needed</Text>
        <Text role="body" color="textSecondary" style={{ marginTop: 12 }}>
          PlayScout signs you in with a one-time code sent to your email — there’s no
          password to remember or reset. Enter your email and we’ll send a fresh code.
        </Text>
        <View style={{ height: 24 }} />
        <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
      </View>
    </Screen>
  );
}
