import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { TeamSwitcher } from './TeamSwitcher';

/**
 * Screen top bar. On team-scoped screens it hosts the global TeamSwitcher; on
 * others it shows a plain title. A trailing slot holds one optional action.
 */
export function TopBar({
  title,
  showTeamSwitcher = false,
  trailing,
}: {
  title?: string;
  showTeamSwitcher?: boolean;
  trailing?: React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + 6,
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.left}>
        {showTeamSwitcher ? <TeamSwitcher /> : title ? <Text role="screenTitle">{title}</Text> : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  left: { flex: 1 },
  trailing: { marginLeft: 12 },
});
