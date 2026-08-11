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
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = EMAIL_RE.test(email.trim()) && password.length > 0;

  async function onSignIn() {
    if (!valid) return;
    setLoading(true);
    setError(null);
    const { error: err } = await signInWithPassword(email, password);
    setLoading(false);
    // On success, onAuthStateChange flips status → the auth layout redirects.
    if (err) {
      setError(
        /invalid login credentials/i.test(err)
          ? 'That email and password don’t match. Check them and try again.'
          : 'We couldn’t sign you in. Please try again.',
      );
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={[styles.root, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
        <View>
          <Text role="screenTitle">PlayScout</Text>
          <Text role="body" color="textSecondary" style={{ marginTop: 8 }}>
            Your film room, in hand. Sign in with your PlayScout email and password.
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
            returnKeyType="next"
            style={inputStyle(theme)}
          />

          <Text role="label" style={{ marginTop: 20, marginBottom: 8 }}>
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
            autoComplete="current-password"
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={onSignIn}
            style={inputStyle(theme)}
          />

          {error ? (
            <Text role="metadata" style={{ color: theme.colors.error, marginTop: 10 }}>
              {error}
            </Text>
          ) : null}

          <View style={{ height: 20 }} />
          <Button label="Sign in" onPress={onSignIn} loading={loading} disabled={!valid} />

          <Text
            role="label"
            color="gold"
            align="center"
            style={{ marginTop: 16 }}
            onPress={() => router.push('/(auth)/forgot-password')}
          >
            Forgot password?
          </Text>
        </View>

        <View style={{ flex: 1 }} />
        <Text role="metadata" color="textSecondary" align="center">
          PlayScout is invite-only. Ask your team admin to add you if you can’t sign in.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function inputStyle(theme: ReturnType<typeof useTheme>) {
  return {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
  } as const;
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
});
