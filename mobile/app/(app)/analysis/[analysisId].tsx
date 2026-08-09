import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Screen, TopBar, Text, IconButton, ErrorState, Skeleton } from '@/components';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAnalysis } from '@/hooks/queries';
import { AnalysisReport } from '@/features/reports/AnalysisReport';
import { canWrite } from '@/utils/roles';
import { useTeamStore } from '@/stores/teamStore';

export default function AnalysisScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { analysisId } = useLocalSearchParams<{ analysisId: string }>();
  const { activeTeam } = useTeamStore();
  const query = useAnalysis(analysisId);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <TopBar
        title="Report"
        trailing={
          <IconButton accessibilityLabel="Back" onPress={() => router.back()}>
            <Ionicons name="close" size={26} color={theme.colors.text} />
          </IconButton>
        }
      />
      <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
        {query.isLoading ? (
          <View style={{ marginTop: 16, gap: 12 }}>
            <Skeleton height={120} radius={16} />
            <Skeleton height={80} radius={16} />
            <Skeleton height={160} radius={16} />
          </View>
        ) : query.isError || !query.data ? (
          <ErrorState message="We couldn’t load this report." onRetry={() => query.refetch()} />
        ) : (
          <View style={{ marginTop: 12 }}>
            <AnalysisReport result={query.data.result} />
            {canWrite(activeTeam?.role) ? (
              <View style={{ marginTop: 24 }}>
                {/* Coach correction routes to a dedicated editor screen. */}
                <CorrectionLink analysisId={analysisId} />
              </View>
            ) : null}
          </View>
        )}
      </Screen>
    </>
  );
}

function CorrectionLink({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  return (
    <Text
      role="label"
      color="gold"
      align="center"
      onPress={() => router.push(`/(app)/analysis/${analysisId}/correct`)}
    >
      Correct this analysis
    </Text>
  );
}
