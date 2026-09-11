import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  Screen,
  TopBar,
  Text,
  Card,
  Section,
  Row,
  Button,
  Field,
  ScoreBlock,
  EmptyState,
  ErrorState,
  Skeleton,
  BottomSheet,
  ConfirmationSheet,
  useToast,
} from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { usePlaybooks, qk } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { canWrite, writeDeniedReason } from '@/utils/roles';
import {
  uploadPlaybook,
  analyzePlaybook,
  deletePlaybook,
  PLAYBOOK_MIME_TYPES,
} from '@/lib/api/endpoints';
import { useQueryClient } from '@tanstack/react-query';
import { relativeTime } from '@/utils/time';
import type { Playbook } from '@/types/domain';

/**
 * PlaybookIQ — upload a playbook and read what it says about the install.
 *
 * Editing individual plays stays on the web; that screen is a diagram editor
 * and a phone is the wrong instrument for it. Everything a coach reads rather
 * than draws is here.
 */
export default function PlaybookScreen() {
  const theme = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeTeam } = useTeamStore();
  const playbooks = usePlaybooks(activeTeam?.id ?? null);

  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removing, setRemoving] = useState<Playbook | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const writable = canWrite(activeTeam?.role);

  function refresh() {
    if (activeTeam) queryClient.invalidateQueries({ queryKey: qk.playbooks(activeTeam.id) });
  }

  async function pickAndUpload(title: string) {
    if (!activeTeam) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: [...PLAYBOOK_MIME_TYPES],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const file = res.assets[0];

    // The picker's `type` filter is advisory on some platforms, so check here
    // too rather than letting the server reject it after the whole upload.
    if (file.mimeType && !PLAYBOOK_MIME_TYPES.includes(file.mimeType as never)) {
      toast('That file type isn’t supported. Use a PDF, PowerPoint, Word file or image.', 'error');
      return;
    }

    setPickerOpen(false);
    setUploading(true);
    try {
      await uploadPlaybook({
        teamId: activeTeam.id,
        title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType ?? 'application/pdf',
      });
      refresh();
      toast('Playbook uploaded. Run the analysis when you’re ready.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not upload that playbook', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function onAnalyze(pb: Playbook) {
    if (!activeTeam) return;
    setAnalyzingId(pb.id);
    try {
      await analyzePlaybook({
        playbookId: pb.id,
        teamName: activeTeam.name,
        ageGroup: activeTeam.ageGroup ?? undefined,
      });
      refresh();
      setExpanded(pb.id);
      toast('Playbook analyzed.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not analyze that playbook', 'error');
    } finally {
      setAnalyzingId(null);
    }
  }

  async function onRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await deletePlaybook(removing.id);
      refresh();
      setRemoving(null);
      toast('Playbook deleted.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete that playbook', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title="PlaybookIQ" />
      <Screen>
        {!writable ? (
          <Card style={{ marginTop: 12, borderColor: theme.colors.warning }}>
            <Text role="body">{writeDeniedReason(activeTeam?.role)}</Text>
          </Card>
        ) : (
          <View style={{ marginTop: 12 }}>
            <Button
              label={uploading ? 'Uploading…' : 'Upload a playbook'}
              onPress={() => setPickerOpen(true)}
              loading={uploading}
              disabled={uploading}
            />
            <Text role="metadata" color="textSecondary" align="center" style={{ marginTop: 8 }}>
              PDF, PowerPoint, Word or a photo of the call sheet.
            </Text>
          </View>
        )}

        <Section title="Your playbooks">
          {playbooks.isLoading ? (
            <View style={{ gap: 10 }}>
              {[0, 1].map((i) => (
                <Skeleton key={i} height={92} radius={14} />
              ))}
            </View>
          ) : playbooks.isError ? (
            <ErrorState onRetry={() => playbooks.refetch()} />
          ) : (playbooks.data?.playbooks.length ?? 0) === 0 ? (
            <EmptyState
              title="No playbooks yet"
              message="Upload your playbook and PlayScout will read it for complexity, install order, and what to cut."
            />
          ) : (
            (playbooks.data?.playbooks ?? []).map((pb) => (
              <PlaybookCard
                key={pb.id}
                playbook={pb}
                expanded={expanded === pb.id}
                onToggle={() => setExpanded((e) => (e === pb.id ? null : pb.id))}
                onAnalyze={() => onAnalyze(pb)}
                analyzing={analyzingId === pb.id}
                onRemove={writable ? () => setRemoving(pb) : undefined}
                writable={writable}
              />
            ))
          )}
        </Section>

        <View style={{ height: 24 }} />
      </Screen>

      <TitleSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onPick={pickAndUpload} />

      <ConfirmationSheet
        visible={!!removing}
        title="Delete this playbook?"
        message={
          removing
            ? `"${removing.title}" and its analysis will be removed. Your film is untouched.`
            : undefined
        }
        confirmLabel={busy ? 'Deleting…' : 'Delete playbook'}
        destructive
        onConfirm={onRemove}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

function TitleSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (title: string) => void;
}) {
  const [title, setTitle] = useState('');
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Upload a playbook">
      <Field
        label="Name it (optional)"
        value={title}
        onChangeText={setTitle}
        placeholder="2026 Offense"
        hint="Leave blank to use the file name."
      />
      <Button label="Choose a file" onPress={() => onPick(title)} />
    </BottomSheet>
  );
}

function PlaybookCard({
  playbook,
  expanded,
  onToggle,
  onAnalyze,
  analyzing,
  onRemove,
  writable,
}: {
  playbook: Playbook;
  expanded: boolean;
  onToggle: () => void;
  onAnalyze: () => void;
  analyzing: boolean;
  onRemove?: () => void;
  writable: boolean;
}) {
  const theme = useTheme();
  const a = playbook.analysis;

  return (
    <Card style={{ marginBottom: 8 }}>
      <Pressable onPress={a ? onToggle : undefined} accessibilityRole={a ? 'button' : undefined}>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text role="label">{playbook.title}</Text>
            <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
              {playbook.file_type.toUpperCase()}
              {playbook.page_count ? ` · ${playbook.page_count} pages` : ''} ·{' '}
              {relativeTime(playbook.created_at)}
            </Text>
          </View>
          {a ? <ScoreBlock score={a.overall_score} size="sm" /> : null}
        </Row>
      </Pressable>

      {/* Age-appropriateness is a safety signal, not a score, so it sits
          above the numbers rather than inside them. */}
      {a && a.age_appropriate === false ? (
        <Card style={{ marginTop: 10, borderColor: theme.colors.warning }}>
          <Text role="label">Too complex for this age group</Text>
          <Text role="body" color="textSecondary" style={{ marginTop: 4 }}>
            Smaller play menus and more reps beat scheme depth at this level.
          </Text>
        </Card>
      ) : null}

      {a?.summary ? (
        <Text role="body" color="textSecondary" style={{ marginTop: 10 }} numberOfLines={expanded ? undefined : 3}>
          {a.summary}
        </Text>
      ) : null}

      {!a ? (
        writable ? (
          <View style={{ marginTop: 12 }}>
            <Button
              label={analyzing ? 'Reading the playbook…' : 'Analyze this playbook'}
              onPress={onAnalyze}
              loading={analyzing}
              disabled={analyzing}
            />
          </View>
        ) : (
          <Text role="metadata" color="textSecondary" style={{ marginTop: 10 }}>
            Not analyzed yet.
          </Text>
        )
      ) : null}

      {a && expanded ? (
        <View style={{ marginTop: 14 }}>
          {a.install_order.length > 0 ? (
            <>
              <Text role="label" style={{ marginBottom: 8 }}>
                Install order
              </Text>
              {a.install_order.map((step, i) => (
                <Row key={i} align="flex-start" style={{ marginBottom: 8 }}>
                  <Text role="metadata" style={{ color: theme.colors.gold, width: 56 }}>
                    Week {step.week}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text role="body">{step.play}</Text>
                    <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                      {step.reason}
                    </Text>
                  </View>
                </Row>
              ))}
            </>
          ) : null}

          <ListBlock title="Keep" items={a.plays_to_keep} />
          <ListBlock title="Consider cutting" items={a.plays_to_remove} />
          <ListBlock title="Strengths" items={a.strengths} />
          <ListBlock title="Weaknesses" items={a.weaknesses} />

          {a.upgrade_recommendations.length > 0 ? (
            <>
              <Text role="label" style={{ marginTop: 14, marginBottom: 8 }}>
                Recommendations
              </Text>
              {a.upgrade_recommendations.map((r, i) => (
                <View key={i} style={{ marginBottom: 10 }}>
                  <Row justify="space-between">
                    <Text role="body" style={{ flex: 1, paddingRight: 8 }}>
                      {r.title}
                    </Text>
                    <Text
                      role="metadata"
                      style={{ color: r.priority === 'high' ? theme.colors.warning : theme.colors.textSecondary }}
                    >
                      {r.priority}
                    </Text>
                  </Row>
                  <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                    {r.reason}
                  </Text>
                </View>
              ))}
            </>
          ) : null}

          {writable ? (
            <View style={{ marginTop: 12 }}>
              <Button
                label={analyzing ? 'Re-reading…' : 'Analyze again'}
                variant="secondary"
                onPress={onAnalyze}
                loading={analyzing}
                disabled={analyzing}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {onRemove ? (
        <Pressable onPress={onRemove} style={{ marginTop: 12 }} accessibilityRole="button">
          <Text role="metadata" style={{ color: theme.colors.error }}>
            Delete playbook
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  const theme = useTheme();
  if (!items || items.length === 0) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <Text role="label" style={{ marginBottom: 6 }}>
        {title}
      </Text>
      {items.map((t, i) => (
        <Row key={i} align="flex-start" style={{ marginBottom: 4 }}>
          <Text style={{ color: theme.colors.gold, marginRight: 8 }}>•</Text>
          <Text role="body" style={{ flex: 1 }}>
            {t}
          </Text>
        </Row>
      ))}
    </View>
  );
}
