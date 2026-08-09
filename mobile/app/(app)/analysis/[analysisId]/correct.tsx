import React, { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Screen, TopBar, Text, Button, ErrorState, Skeleton, useToast } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useAnalysis, qk } from '@/hooks/queries';
import { saveAnalysisCorrection } from '@/lib/api/endpoints';

/**
 * Coach correction. Edits create a server-side audit trail (original_result is
 * snapshotted, output_corrections rows written) — the original is never lost.
 * We keep the mobile editor to the highest-signal fields; the server ignores
 * anything outside its allowlist.
 */
export default function CorrectAnalysis() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { analysisId } = useLocalSearchParams<{ analysisId: string }>();
  const query = useAnalysis(analysisId);

  const [summary, setSummary] = useState('');
  const [score, setScore] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.data?.result) {
      setSummary(query.data.result.summary ?? '');
      setScore(query.data.result.overall_score != null ? String(query.data.result.overall_score) : '');
    }
  }, [query.data]);

  async function onSave() {
    const patch: { summary?: string; overall_score?: number } = {};
    if (summary.trim() !== (query.data?.result.summary ?? '')) patch.summary = summary.trim();
    const parsed = parseInt(score, 10);
    if (Number.isFinite(parsed) && parsed !== query.data?.result.overall_score) {
      patch.overall_score = Math.max(0, Math.min(100, parsed));
    }
    if (Object.keys(patch).length === 0) {
      toast('No changes to save');
      return;
    }
    setSaving(true);
    try {
      await saveAnalysisCorrection(analysisId, patch);
      await queryClient.invalidateQueries({ queryKey: qk.analysis(analysisId) });
      toast('Correction saved', 'success');
      router.back();
    } catch {
      toast('Could not save correction', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <TopBar title="Correct analysis" />
      <Screen>
        {query.isLoading ? (
          <View style={{ marginTop: 16, gap: 12 }}>
            <Skeleton height={48} />
            <Skeleton height={120} />
          </View>
        ) : query.isError || !query.data ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : (
          <View style={{ marginTop: 12 }}>
            <Text role="metadata" color="textSecondary" style={{ marginBottom: 16 }}>
              Your edits are kept alongside the original — PlayScout learns from coach
              corrections. Nothing is overwritten.
            </Text>

            <Text role="label" style={{ marginBottom: 6 }}>
              Overall score (0–100)
            </Text>
            <TextInput
              value={score}
              onChangeText={(t) => setScore(t.replace(/\D/g, '').slice(0, 3))}
              keyboardType="number-pad"
              inputMode="numeric"
              style={[styles.input, inputStyle(theme)]}
            />

            <Text role="label" style={{ marginTop: 20, marginBottom: 6 }}>
              Summary
            </Text>
            <TextInput
              value={summary}
              onChangeText={setSummary}
              multiline
              style={[styles.input, styles.multiline, inputStyle(theme)]}
            />

            <View style={{ height: 24 }} />
            <Button label="Save correction" onPress={onSave} loading={saving} haptic={null} />
          </View>
        )}
      </Screen>
    </>
  );
}

function inputStyle(theme: ReturnType<typeof useTheme>) {
  return {
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
  };
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 16 },
  multiline: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
});
