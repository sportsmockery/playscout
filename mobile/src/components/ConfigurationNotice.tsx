import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/**
 * Shown when the app was built without its public Supabase config.
 *
 * A build in this state cannot sign anyone in, so there is nothing for a coach
 * to do here — the screen exists so the failure is legible instead of a launch
 * crash, and so a TestFlight tester can report something more useful than "it
 * closes when I open it".
 */
export function ConfigurationNotice() {
  const theme = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background, padding: theme.spacing.xl }]}>
      <Text role="screenTitle" align="center">
        PlayScout isn’t configured
      </Text>
      <Text role="body" color="textSecondary" align="center" style={styles.body}>
        This build is missing the connection settings it needs to reach PlayScout,
        so it can’t sign you in. This is a build problem, not something you can
        fix on your phone.
      </Text>
      <Text role="metadata" color="textSecondary" align="center" style={styles.body}>
        Please report this build to your PlayScout contact.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { marginTop: 12, maxWidth: 340 },
});
