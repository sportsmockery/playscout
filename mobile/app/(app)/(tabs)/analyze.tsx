import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, TopBar, Text, Section, Card, EmptyState } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useTeamStore } from '@/stores/teamStore';
import { MODULE_CATALOG, type ModuleDef } from '@/features/intelligence/modules';

/**
 * Analyze hub — grouped, progressive. Never a wall of seven equal tiles.
 * Modules route to a preflight screen that summarizes scope before any run.
 */
export default function AnalyzeScreen() {
  const router = useRouter();
  const { activeTeam } = useTeamStore();

  if (!activeTeam) {
    return (
      <>
        <TopBar showTeamSwitcher />
        <Screen>
          <EmptyState title="No team selected" message="Pick a team to run analysis." />
        </Screen>
      </>
    );
  }

  const groups: { title: string; group: ModuleDef['group'] }[] = [
    { title: 'Position development', group: 'position' },
    { title: 'Team patterns', group: 'team' },
    { title: 'Opponent scouting', group: 'opponent' },
    { title: 'Playbook', group: 'playbook' },
  ];

  return (
    <>
      <TopBar showTeamSwitcher />
      <Screen>
        <Section title="Recommended" style={{ marginTop: 12 }}>
          <Card>
            <Text role="body" color="textSecondary">
              Open a film, confirm its plays, then run the module that fits what you want to
              coach. Team-wide modules can run across a whole game.
            </Text>
          </Card>
        </Section>

        {groups.map((g) => {
          const mods = MODULE_CATALOG.filter((m) => m.group === g.group);
          if (mods.length === 0) return null;
          return (
            <Section key={g.group} title={g.title}>
              {mods.map((m) => (
                <ModuleRow key={m.key} module={m} onPress={() => router.push(`/(app)/module/${m.key}`)} />
              ))}
            </Section>
          );
        })}

        <Section title="History">
          <Card>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(app)/analysis/history')}
              style={{ paddingVertical: 4 }}
            >
              <Text role="label" color="gold">
                View all saved analyses
              </Text>
            </Pressable>
          </Card>
        </Section>
      </Screen>
    </>
  );
}

function ModuleRow({ module, onPress }: { module: ModuleDef; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${module.name}. ${module.blurb}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text role="label">{module.name}</Text>
        <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
          {module.blurb}
        </Text>
      </View>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 20 }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
});
