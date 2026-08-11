import React, { useState } from 'react';
import { View, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/lib/auth/AuthContext';

export default function Verify() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verifyEmailOtp } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supabase's email OTP length is configurable (6–10 digits); accept whatever
  // this project is set to rather than assuming six.
  const valid = /^\d{6,10}$/.test(code.trim());

  async function onVerify() {
    if (!valid || !email) return;
    setLoading(true);
    setError(null);
    const { error: err } = await verifyEmailOtp(email, code);
    setLoading(false);
    // On success, onAuthStateChange flips status → the auth layout redirects.
    if (err) setError('That code didn’t work. Check it and try again, or request a new one.');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={[styles.root, { paddingTop: insets.top + 48 }]}>
        <Text role="screenTitle">Enter your code</Text>
        <Text role="body" color="textSecondary" style={{ marginTop: 8 }}>
          We sent a code to {email}. Type the number from the email — it expires shortly.
        </Text>

        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 10))}
          placeholder="Code"
          maxLength={10}
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          returnKeyType="go"
          onSubmitEditing={onVerify}
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
        <Button label="Verify & continue" onPress={onVerify} loading={loading} disabled={!valid} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  input: {
    marginTop: 32,
    minHeight: 60,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
