import React from 'react';
import { View, Pressable, FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useBootstrap } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { ROLE_LABELS } from '@/utils/roles';
import { resolveLevelTier, tierLabel } from '@/utils/levels';

/** Full-screen team picker (modal). Mirrors the TeamSwitcher sheet for deep
 * links / first-run when no team is set yet. */
export default function TeamPicker() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const bootstrap = useBootstrap();
  const { activeTeam, setActiveTeam } = useTeamStore();
  const teams = bootstrap.data?.teams ?? [];

  return (
    <Screen scroll={false}>
      <Text role="screenTitle" style={{ marginTop: 12, marginBottom: 16 }}>
        Your teams
      </Text>
      <FlatList
        data={teams}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => {
          const active = item.id === activeTeam?.id;
          return (
            <Pressable
              onPress={() => {
                queryClient.cancelQueries();
                setActiveTeam({ id: item.id, name: item.name, ageGroup: item.age_group, level: item.level, role: item.role });
                queryClient.invalidateQueries();
                router.back();
              }}
              style={[styles.row, { borderColor: theme.colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text role="label">{item.name}</Text>
                <Text role="metadata" color="textSecondary">
                  {tierLabel(resolveLevelTier({ age_group: item.age_group, level: item.level }))}
                  {item.role ? ` · ${ROLE_LABELS[item.role]}` : ''}
                </Text>
              </View>
              {active ? <Text style={{ color: theme.colors.gold, fontSize: 18 }}>✓</Text> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text role="body" color="textSecondary">
            You’re not on any teams yet. Ask your organization admin to add you.
          </Text>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
});
