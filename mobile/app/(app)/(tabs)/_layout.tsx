import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/ThemeProvider';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS = {
  home: { active: 'home', inactive: 'home-outline' },
  film: { active: 'film', inactive: 'film-outline' },
  analyze: { active: 'stats-chart', inactive: 'stats-chart-outline' },
  coach: { active: 'chatbubbles', inactive: 'chatbubbles-outline' },
  more: { active: 'ellipsis-horizontal-circle', inactive: 'ellipsis-horizontal-circle-outline' },
} satisfies Record<string, { active: IoniconName; inactive: IoniconName }>;

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const set = ICONS[route.name as keyof typeof ICONS] ?? ICONS.home;
          return <Ionicons name={focused ? set.active : set.inactive} size={size} color={color} />;
        },
      })}
      screenListeners={{
        tabPress: () => {
          Haptics.selectionAsync().catch(() => {});
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="film" options={{ title: 'Film' }} />
      <Tabs.Screen name="analyze" options={{ title: 'Analyze' }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
