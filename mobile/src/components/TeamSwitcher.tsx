import React, { useMemo, useState } from 'react';
import { View, Pressable, TextInput, FlatList, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { BottomSheet } from './BottomSheet';
import { useBootstrap } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { ROLE_LABELS } from '@/utils/roles';
import { tierLabel, resolveLevelTier } from '@/utils/levels';

/** Compact top-bar control showing the active team + level, opening a
 * searchable sheet. Switching invalidates all team-scoped queries so no
 * Team A data ever shows under Team B chrome. */
export function TeamSwitcher() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const bootstrap = useBootstrap();
  const { activeTeam, setActiveTeam } = useTeamStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const teams = useMemo(() => bootstrap.data?.teams ?? [], [bootstrap.data?.teams]);
  const filtered = useMemo(
    () => teams.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase())),
    [teams, q],
  );

  function choose(id: string) {
    const t = teams.find((x) => x.id === id);
    if (!t || t.id === activeTeam?.id) {
      setOpen(false);
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    // Cancel obsolete in-flight requests, then swap and drop stale team data.
    queryClient.cancelQueries();
    setActiveTeam({ id: t.id, name: t.name, ageGroup: t.age_group, level: t.level, role: t.role });
    queryClient.invalidateQueries();
    setOpen(false);
    setQ('');
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Active team ${activeTeam?.name ?? 'none'}. Change team.`}
        onPress={() => setOpen(true)}
        hitSlop={6}
        style={styles.trigger}
      >
        <View style={{ flexShrink: 1 }}>
          <Text role="sectionTitle" numberOfLines={1}>
            {activeTeam?.name ?? 'Select a team'}
          </Text>
          {activeTeam ? (
            <Text role="metadata" color="textSecondary" numberOfLines={1}>
              {tierLabel(resolveLevelTier({ age_group: activeTeam.ageGroup, level: activeTeam.level }))}
              {activeTeam.role ? ` · ${ROLE_LABELS[activeTeam.role]}` : ''}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 16, marginLeft: 6 }}>⌄</Text>
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Switch team">
        {teams.length > 6 ? (
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search teams"
            placeholderTextColor={theme.colors.textSecondary}
            style={[
              styles.search,
              { color: theme.colors.text, backgroundColor: theme.colors.fill, borderRadius: theme.radius.md },
            ]}
          />
        ) : null}
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          style={{ maxHeight: 380 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const active = item.id === activeTeam?.id;
            return (
              <Pressable
                onPress={() => choose(item.id)}
                style={[styles.row, { borderColor: theme.colors.border }]}
                accessibilityState={{ selected: active }}
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
            <Text role="body" color="textSecondary" style={{ paddingVertical: 24 }} align="center">
              No teams match “{q}”.
            </Text>
          }
        />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  search: { minHeight: 44, paddingHorizontal: 14, fontSize: 16, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
