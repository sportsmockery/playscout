import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/lib/auth/AuthContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const theme = useTheme();
  const router = useRouter();
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const valid = EMAIL_RE.test(email.trim());

  async function onSend() {
    if (!valid) return;
    setLoading(true);
    // Always show the same confirmation — don't reveal whether an email exists.
    await sendPasswordReset(email);
    setLoading(false);
    setSent(true);
  }

  return (
    <Screen>
      <View style={{ marginTop: 64 }}>
        <Text role="screenTitle">Reset your password</Text>
        {sent ? (
          <>
            <Text role="body" color="textSecondary" style={{ marginTop: 12 }}>
              If an account exists for {email.trim()}, we’ve sent a reset link. Open it to set
              a new password, then come back and sign in.
            </Text>
            <View style={{ height: 24 }} />
            <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
          </>
        ) : (
          <>
            <Text role="body" color="textSecondary" style={{ marginTop: 12 }}>
              Enter your email and we’ll send a link to reset your password.
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="coach@team.org"
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              returnKeyType="go"
              onSubmitEditing={onSend}
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                },
              ]}
            />
            <View style={{ height: 20 }} />
            <Button label="Send reset link" onPress={onSend} loading={loading} disabled={!valid} />
            <Text
              role="label"
              color="gold"
              align="center"
              style={{ marginTop: 16 }}
              onPress={() => router.replace('/(auth)/sign-in')}
            >
              Back to sign in
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { marginTop: 24, minHeight: 52, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, fontSize: 16 },
});
