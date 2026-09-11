import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Text, Row, ProgressBar } from '@/components';
import { useActiveBatches } from '@/hooks/queries';
import type { ActiveBatch } from '@/types/domain';

function isLive(b: ActiveBatch): boolean {
  return b.status === 'queued' || b.status === 'running';
}

/**
 * In-flight analysis, visible from anywhere in the app.
 *
 * Work a coach can't see is work they assume died. The batch itself is driven
 * by the Railway worker, so this is a window onto the database, never the thing
 * that makes progress happen.
 */
export function AnalysisQueueBanner({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  const { data } = useActiveBatches(enabled);

  const live = (data?.batches ?? []).filter(isLive);
  if (live.length === 0) return null;

  const head = live[0];
  if (!head) return null;
  const done = head.completed_jobs + head.failed_jobs;

  return (
    <Card>
      <Row justify="space-between">
        <Text role="label" numberOfLines={1} style={{ flex: 1 }}>
          Analyzing film
          {live.length > 1 ? ` · ${live.length} sessions` : ''}
        </Text>
        <Text
          role="label"
          color="gold"
          onPress={() => router.push(`/(app)/analysis/batch/${head.id}`)}
        >
          Open
        </Text>
      </Row>
      <Text role="metadata" color="textSecondary" numberOfLines={1} style={{ marginTop: 2 }}>
        {head.title ?? head.module_key}
        {head.team_name ? ` · ${head.team_name}` : ''}
      </Text>
      <View style={{ marginTop: 10 }}>
        <ProgressBar value={head.total_jobs ? done / head.total_jobs : 0} />
        <Text role="metadata" color="textSecondary" style={{ marginTop: 6 }}>
          {done} of {head.total_jobs} clip{head.total_jobs === 1 ? '' : 's'}
        </Text>
      </View>
    </Card>
  );
}
