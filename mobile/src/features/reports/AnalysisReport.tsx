import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text, Card, Section, Divider, Row, ScoreBlock, ConfidenceLabel, EvidenceCount, SafetyAlert } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { EvidenceFrames } from './EvidenceFrames';
import { sampleSizeLabel } from '@/utils/score';
import type { AnalysisResult, MistakeItem, Tendency } from '@/types/domain';

/**
 * Progressive-disclosure report. Observation, interpretation, confidence, and
 * recommendation stay visibly distinct — never collapsed into one paragraph.
 * Safety outranks performance and renders first.
 */
export function AnalysisReport({ result }: { result: AnalysisResult }) {
  const evidence = result.evidence ?? {};
  const confidence = evidence.confidence;
  const plays = evidence.plays_observed;
  const module = result.module_key ?? 'Analysis';
  const isMistake = module.toUpperCase().includes('MISTAKE');
  const isTeamLike = ['TEAMIQ', 'SCOUTIQ'].includes(module.toUpperCase());

  return (
    <View>
      {evidence.head_contact_flag?.flagged ? (
        <View style={{ marginBottom: 16 }}>
          <SafetyAlert flag={evidence.head_contact_flag} />
        </View>
      ) : null}

      {/* 1. Overall conclusion */}
      <Card>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text role="metadata" color="textSecondary">
              {module}
            </Text>
            <Text role="sectionTitle" style={{ marginTop: 4 }}>
              {result.summary ?? 'No summary available.'}
            </Text>
          </View>
          {!isMistake && !isTeamLike ? <ScoreBlock score={result.overall_score} /> : null}
        </Row>

        {/* 2. Confidence + evidence sufficiency — distinct from the score */}
        <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <ConfidenceLabel confidence={confidence} />
          <EvidenceCount plays={plays} frames={evidence.frames?.length} />
        </Row>
        {result.edited_at ? (
          <Text role="metadata" color="textSecondary" style={{ marginTop: 8 }}>
            Edited by a coach — original result preserved.
          </Text>
        ) : null}
      </Card>

      {/* Module-specific bodies */}
      {isMistake ? <MistakeList mistakes={evidence.mistakes ?? []} videoId={result.video_id} /> : null}
      {isTeamLike ? (
        <TeamPatterns
          offensive={evidence.offensive_tendencies ?? []}
          defensive={evidence.defensive_tendencies ?? []}
          tells={evidence.situational_tells ?? []}
        />
      ) : null}

      {/* 3. What was observed */}
      {result.strengths && result.strengths.length > 0 ? (
        <Section title="What was observed">
          {result.strengths.map((s, i) => (
            <BulletRow key={`s${i}`} text={s} />
          ))}
        </Section>
      ) : null}

      {/* 4. Football interpretation (reasoning) */}
      {result.reasoning && Object.keys(result.reasoning).length > 0 ? (
        <Section title="Football interpretation">
          <Card>
            {Object.entries(result.reasoning).map(([k, v]) => (
              <View key={k} style={{ marginBottom: 10 }}>
                <Text role="label">{humanize(k)}</Text>
                <Text role="body" color="textSecondary" style={{ marginTop: 2 }}>
                  {v}
                </Text>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {/* 5. What to correct */}
      {result.weaknesses && result.weaknesses.length > 0 ? (
        <Section title="What to correct">
          {result.weaknesses.map((w, i) => (
            <BulletRow key={`w${i}`} text={w} />
          ))}
        </Section>
      ) : null}

      {/* 6. Practice recommendation */}
      {result.drills && result.drills.length > 0 ? (
        <Section title="Practice this week">
          {result.drills.map((d, i) => (
            <BulletRow key={`d${i}`} text={d} />
          ))}
        </Section>
      ) : null}

      {/* 7. Supporting frames */}
      {result.video_id && (evidence.frames?.length ?? 0) > 0 ? (
        <Section title="Supporting frames">
          <EvidenceFrames videoId={result.video_id} frameIndices={evidence.frames ?? []} />
        </Section>
      ) : null}

      {/* 8. Detailed scores (collapsed) */}
      {result.position_scores && Object.keys(result.position_scores).length > 0 ? (
        <Collapsible title="Detailed scores">
          {Object.entries(result.position_scores).map(([k, v]) => (
            <Row key={k} justify="space-between" style={{ paddingVertical: 6 }}>
              <Text role="body">{humanize(k)}</Text>
              <Text role="label" tabular>
                {v == null ? 'No evidence' : Math.round(v)}
              </Text>
            </Row>
          ))}
        </Collapsible>
      ) : null}
    </View>
  );
}

function MistakeList({ mistakes, videoId }: { mistakes: MistakeItem[]; videoId?: string | null }) {
  const theme = useTheme();
  if (mistakes.length === 0) return null;
  const sevColor: Record<string, string> = {
    minor: theme.colors.textSecondary,
    moderate: theme.colors.warning,
    major: theme.colors.error,
    game_changing: theme.colors.error,
  };
  return (
    <Section title="Mistakes">
      {mistakes.map((m, i) => (
        <Card key={i} style={{ marginBottom: 10 }}>
          <Row justify="space-between">
            <Text role="label" style={{ flex: 1 }}>
              {m.title}
            </Text>
            <Text role="metadata" style={{ color: sevColor[m.severity] ?? theme.colors.textSecondary }}>
              {humanize(m.severity)}
            </Text>
          </Row>
          {m.category ? (
            <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
              {humanize(m.category)}
            </Text>
          ) : null}
          {m.likely_impact ? (
            <Text role="body" style={{ marginTop: 8 }}>
              <Text role="label">Impact: </Text>
              {m.likely_impact}
            </Text>
          ) : null}
          {m.correction ? (
            <Text role="body" color="textSecondary" style={{ marginTop: 6 }}>
              <Text role="label">Fix: </Text>
              {m.correction}
            </Text>
          ) : null}
          {m.drill ? (
            <Text role="body" color="textSecondary" style={{ marginTop: 6 }}>
              <Text role="label">Drill: </Text>
              {m.drill}
            </Text>
          ) : null}
          <Row gap={8} style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <ConfidenceLabel confidence={m.confidence} />
          </Row>
          {videoId && (m.evidence_frames?.length ?? 0) > 0 ? (
            <View style={{ marginTop: 10 }}>
              <EvidenceFrames videoId={videoId} frameIndices={m.evidence_frames ?? []} compact />
            </View>
          ) : null}
        </Card>
      ))}
    </Section>
  );
}

function TeamPatterns({
  offensive,
  defensive,
  tells,
}: {
  offensive: Tendency[];
  defensive: Tendency[];
  tells: { situation: string; tell: string; confidence?: number }[];
}) {
  return (
    <>
      {offensive.length > 0 ? (
        <Section title="Offensive tendencies">
          {offensive.map((t, i) => (
            <TendencyRow key={`o${i}`} t={t} />
          ))}
        </Section>
      ) : null}
      {defensive.length > 0 ? (
        <Section title="Defensive tendencies">
          {defensive.map((t, i) => (
            <TendencyRow key={`d${i}`} t={t} />
          ))}
        </Section>
      ) : null}
      {tells.length > 0 ? (
        <Section title="Situational tells">
          {tells.map((t, i) => (
            <Card key={i} style={{ marginBottom: 8 }}>
              <Text role="label">{t.situation}</Text>
              <Text role="body" color="textSecondary" style={{ marginTop: 2 }}>
                {t.tell}
              </Text>
              <View style={{ marginTop: 8 }}>
                <ConfidenceLabel confidence={t.confidence} />
              </View>
            </Card>
          ))}
        </Section>
      ) : null}
    </>
  );
}

function TendencyRow({ t }: { t: Tendency }) {
  return (
    <Card style={{ marginBottom: 8 }}>
      <Row justify="space-between">
        <Text role="label" style={{ flex: 1 }}>
          {t.label ?? t.tendency_type ?? 'Tendency'}
        </Text>
        {t.rate != null ? (
          <Text role="label" tabular>
            {Math.round(t.rate * 100)}%
          </Text>
        ) : null}
      </Row>
      {t.description ? (
        <Text role="body" color="textSecondary" style={{ marginTop: 2 }}>
          {t.description}
        </Text>
      ) : null}
      <Row gap={8} style={{ marginTop: 8 }}>
        <ConfidenceLabel confidence={t.confidence} />
        <Text role="metadata" color="textSecondary">
          {sampleSizeLabel(t.sample_size)}
        </Text>
      </Row>
    </Card>
  );
}

function BulletRow({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Row align="flex-start" style={{ marginBottom: 8 }}>
      <View style={[styles.bullet, { backgroundColor: theme.colors.gold }]} />
      <Text role="body" style={{ flex: 1 }}>
        {text}
      </Text>
    </Row>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Section title={undefined}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ paddingVertical: 8 }}>
        <Row justify="space-between">
          <Text role="sectionTitle">{title}</Text>
          <Text role="label" color="gold">
            {open ? 'Hide' : 'Show'}
          </Text>
        </Row>
      </Pressable>
      {open ? (
        <Card>
          {children}
          <Divider />
          <Text role="metadata" color="textSecondary">
            Scores are calibrated to this team’s level. “No evidence” means the film didn’t
            show enough to grade that item.
          </Text>
        </Card>
      ) : null}
    </Section>
  );
}

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8, marginRight: 10 },
});
