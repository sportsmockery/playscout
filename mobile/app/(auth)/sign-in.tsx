import React, { useState } from 'react';
import { View, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/lib/auth/AuthContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { requestEmailOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = EMAIL_RE.test(email.trim());

  async function onContinue() {
    if (!valid) return;
    setLoading(true);
    setError(null);
    const { error: err } = await requestEmailOtp(email);
    setLoading(false);
    // We never reveal whether an email exists (no open signup). On success OR a
    // benign "user not found", route to verify — the code only arrives for real
    // accounts. Only surface genuine transport errors.
    if (err && !/not.*found|signups?\s+not\s+allowed/i.test(err)) {
      setError('We couldn’t send a code right now. Please try again.');
      return;
    }
    router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } });
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={[styles.root, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.header}>
          <Text role="screenTitle">PlayScout</Text>
          <Text role="body" color="textSecondary" style={{ marginTop: 8 }}>
            Your film room, in hand. Sign in with your coaching email and we’ll send a
            one-time code.
          </Text>
        </View>

        <View style={{ marginTop: 40 }}>
          <Text role="label" style={{ marginBottom: 8 }}>
            Email
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
            onSubmitEditing={onContinue}
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
          {error ? (
            <Text role="metadata" style={{ color: theme.colors.error, marginTop: 8 }}>
              {error}
            </Text>
          ) : null}

          <View style={{ height: 20 }} />
          <Button label="Send code" onPress={onContinue} loading={loading} disabled={!valid} />
        </View>

        <View style={{ flex: 1 }} />
        <Text role="metadata" color="textSecondary" align="center">
          PlayScout is invite-only. Ask your team admin to add you if you can’t sign in.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  header: {},
  input: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    fontSize: 16,
  },
});
