import React, { useState } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  Screen,
  TopBar,
  Text,
  Card,
  Section,
  Button,
  Row,
  Field,
  BottomSheet,
  SegmentedControl,
  useToast,
} from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useTeamStore } from '@/stores/teamStore';
import { useOpponents, qk } from '@/hooks/queries';
import { useUploadStore } from '@/stores/uploadStore';
import { makeStoragePath } from '@/features/uploads/uploadManager';
import { formatBytes, LARGE_UPLOAD_THRESHOLD_BYTES } from '@/utils/time';
import { canWrite } from '@/utils/roles';
import { createVideoFromLink, createOpponent } from '@/lib/api/endpoints';
import { useQueryClient } from '@tanstack/react-query';

interface Picked {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

type Source = 'device' | 'link';

let uploadSeq = 0;

export default function UploadScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeTeam } = useTeamStore();
  const opponents = useOpponents(activeTeam?.id ?? null);
  const enqueue = useUploadStore((s) => s.enqueue);

  const [source, setSource] = useState<Source>('device');
  const [file, setFile] = useState<Picked | null>(null);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filmType, setFilmType] = useState<'self' | 'opponent'>('self');
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [addingOpponent, setAddingOpponent] = useState(false);

  if (!activeTeam || !canWrite(activeTeam.role)) {
    return (
      <>
        <TopBar title="Add film" />
        <Screen>
          <Card style={{ marginTop: 16 }}>
            <Text role="body">
              You need coach or analyst access on {activeTeam?.name ?? 'this team'} to add film.
            </Text>
          </Card>
        </Screen>
      </>
    );
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setFile({
        uri: a.uri,
        name: a.fileName ?? `film-${Date.now()}.mp4`,
        size: a.fileSize ?? 0,
        mimeType: a.mimeType ?? 'video/mp4',
      });
      if (!title) setTitle(a.fileName?.replace(/\.[^.]+$/, '') ?? '');
    }
  }

  async function pickDocument() {
    const res = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: false });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setFile({ uri: a.uri, name: a.name, size: a.size ?? 0, mimeType: a.mimeType ?? 'video/mp4' });
      if (!title) setTitle(a.name.replace(/\.[^.]+$/, ''));
    }
  }

  function missingOpponent(): boolean {
    if (filmType === 'opponent' && !opponentId) {
      toast('Choose which opponent this film is', 'error');
      return true;
    }
    return false;
  }

  function startUpload() {
    if (!file || !activeTeam || missingOpponent()) return;
    const id = `up_${Date.now()}_${uploadSeq++}`;
    enqueue({
      id,
      teamId: activeTeam.id,
      title: title.trim() || file.name,
      fileUri: file.uri,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.mimeType,
      filmType,
      opponentId: filmType === 'opponent' ? opponentId ?? undefined : undefined,
      storagePath: makeStoragePath(activeTeam.id, id, file.name),
      status: 'queued',
      bytesUploaded: 0,
      createdAt: Date.now(),
    });
    router.replace('/(app)/upload/progress');
  }

  async function startLink() {
    if (!activeTeam || missingOpponent()) return;
    setLinkError(null);
    setSubmitting(true);
    try {
      const res = await createVideoFromLink({
        teamId: activeTeam.id,
        url: link.trim(),
        title: title.trim() || undefined,
        opponentId: filmType === 'opponent' ? opponentId ?? undefined : undefined,
      });
      queryClient.invalidateQueries({ queryKey: qk.film(activeTeam.id) });
      router.replace(`/(app)/film/${res.videoId}`);
    } catch (e) {
      // The server's refusals are already coach copy ("that's a watch page,
      // paste the file link"), so they belong on the field, not in a toast
      // that vanishes before it can be acted on.
      setLinkError(e instanceof Error ? e.message : 'That link could not be used.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onAddOpponent(name: string) {
    if (!activeTeam) return;
    try {
      const res = await createOpponent({ teamId: activeTeam.id, name });
      queryClient.invalidateQueries({ queryKey: qk.opponents(activeTeam.id) });
      setOpponentId(res.opponent.id);
      setAddingOpponent(false);
      toast('Opponent added.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add that opponent', 'error');
    }
  }

  const isLarge = (file?.size ?? 0) >= LARGE_UPLOAD_THRESHOLD_BYTES;
  const canStart = source === 'device' ? !!file : link.trim().length > 0;

  return (
    <>
      <TopBar title="Add film" />
      <Screen>
        <Section title="Where is the film?" style={{ marginTop: 12 }}>
          <SegmentedControl<Source>
            value={source}
            onChange={(s) => {
              setSource(s);
              setLinkError(null);
            }}
            segments={[
              { value: 'device', label: 'On this phone' },
              { value: 'link', label: 'From a link' },
            ]}
          />
        </Section>

        {source === 'device' ? (
          <Section title="Choose film">
            {file ? (
              <Card>
                <Text role="label" numberOfLines={1}>
                  {file.name}
                </Text>
                <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                  {file.size ? formatBytes(file.size) : 'Size unknown'}
                </Text>
                <Text role="label" color="gold" style={{ marginTop: 8 }} onPress={() => setFile(null)}>
                  Choose a different file
                </Text>
              </Card>
            ) : (
              <Row gap={10}>
                <View style={{ flex: 1 }}>
                  <Button label="Photo library" variant="secondary" onPress={pickFromLibrary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Files" variant="secondary" onPress={pickDocument} />
                </View>
              </Row>
            )}
          </Section>
        ) : (
          <Section title="Paste the link">
            <Field
              label="Direct file link"
              value={link}
              onChangeText={(v) => {
                setLink(v);
                setLinkError(null);
              }}
              error={linkError}
              hint="A direct link to the video file. We never copy it — your host stays the source."
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              inputMode="url"
              placeholder="https://…/game.mp4"
            />
            <Card>
              <Text role="metadata" color="textSecondary">
                A YouTube, Vimeo, Hudl or MaxPreps page won’t work here — those are watch
                pages, not files. For Hudl, connect your account on the web to import a
                playlist.
              </Text>
            </Card>
          </Section>
        )}

        <Section title="Film type">
          <SegmentedControl<'self' | 'opponent'>
            value={filmType}
            onChange={setFilmType}
            segments={[
              { value: 'self', label: 'Our film' },
              { value: 'opponent', label: 'Opponent film' },
            ]}
          />
        </Section>

        {filmType === 'opponent' ? (
          <Section title="Opponent">
            {(opponents.data?.opponents ?? []).map((o) => (
              <Pressable
                key={o.id}
                onPress={() => setOpponentId(o.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: o.id === opponentId }}
                style={[
                  styles.pick,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: o.id === opponentId ? theme.colors.gold : theme.colors.border,
                    borderWidth: o.id === opponentId ? 1.5 : StyleSheet.hairlineWidth,
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <Text role="body" style={{ flex: 1 }}>
                  {o.name}
                </Text>
                {o.id === opponentId ? <Text style={{ color: theme.colors.gold }}>✓</Text> : null}
              </Pressable>
            ))}
            <Button label="Add an opponent" variant="secondary" onPress={() => setAddingOpponent(true)} />
          </Section>
        ) : null}

        <Section title="Title">
          <Field
            label="Film title"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Bulldogs vs Wildcats — Week 3"
          />
        </Section>

        {source === 'device' && isLarge ? (
          <Card style={{ marginTop: 4, borderColor: theme.colors.warning }}>
            <Text role="label">Large file — {formatBytes(file?.size ?? 0)}</Text>
            <Text role="metadata" color="textSecondary" style={{ marginTop: 4 }}>
              We recommend Wi-Fi for full games. The upload resumes automatically if it’s
              interrupted, and keeps going while you use the rest of the app.
            </Text>
          </Card>
        ) : null}

        <View style={{ marginTop: 20 }}>
          <Button
            label={
              submitting ? 'Adding…' : source === 'device' ? 'Start upload' : 'Add this film'
            }
            onPress={source === 'device' ? startUpload : startLink}
            loading={submitting}
            disabled={!canStart || submitting}
          />
        </View>
        {source === 'device' ? (
          <Text role="metadata" color="textSecondary" align="center" style={{ marginTop: 12 }}>
            {Platform.OS === 'ios'
              ? 'Uploads continue in the app.'
              : 'Keep the app open while uploading large files.'}
          </Text>
        ) : null}
      </Screen>

      <AddOpponentSheet
        visible={addingOpponent}
        onClose={() => setAddingOpponent(false)}
        onAdd={onAddOpponent}
      />
    </>
  );
}

function AddOpponentSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onAdd(name.trim());
      setName('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add an opponent">
      <Field
        label="Opponent name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        placeholder="Wildcats"
      />
      <Button
        label={busy ? 'Adding…' : 'Add opponent'}
        onPress={submit}
        loading={busy}
        disabled={busy || !name.trim()}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  pick: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8 },
});
