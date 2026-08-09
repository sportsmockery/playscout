import React, { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, Platform } from 'react-native';
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
  SegmentedControl,
  useToast,
} from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useTeamStore } from '@/stores/teamStore';
import { useOpponents } from '@/hooks/queries';
import { useUploadStore } from '@/stores/uploadStore';
import { makeStoragePath } from '@/features/uploads/uploadManager';
import { formatBytes, LARGE_UPLOAD_THRESHOLD_BYTES } from '@/utils/time';
import { canWrite } from '@/utils/roles';

interface Picked {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

let uploadSeq = 0;

export default function UploadScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { activeTeam } = useTeamStore();
  const opponents = useOpponents(activeTeam?.id ?? null);
  const enqueue = useUploadStore((s) => s.enqueue);

  const [file, setFile] = useState<Picked | null>(null);
  const [filmType, setFilmType] = useState<'self' | 'opponent'>('self');
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  if (!activeTeam || !canWrite(activeTeam.role)) {
    return (
      <>
        <TopBar title="Upload film" />
        <Screen>
          <Card style={{ marginTop: 16 }}>
            <Text role="body">
              You need coach or analyst access on {activeTeam?.name ?? 'this team'} to upload film.
            </Text>
          </Card>
        </Screen>
      </>
    );
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
    });
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

  function start() {
    if (!file || !activeTeam) return;
    if (filmType === 'opponent' && !opponentId) {
      toast('Choose which opponent this film is', 'error');
      return;
    }
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

  const isLarge = (file?.size ?? 0) >= LARGE_UPLOAD_THRESHOLD_BYTES;

  return (
    <>
      <TopBar title="Upload film" />
      <Screen>
        {/* 1. Select / capture */}
        <Section title="Choose film" style={{ marginTop: 12 }}>
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

        {/* 2/3. Our film or opponent */}
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

        {/* 4. Opponent selection */}
        {filmType === 'opponent' ? (
          <Section title="Opponent">
            {(opponents.data?.opponents.length ?? 0) === 0 ? (
              <Card>
                <Text role="body" color="textSecondary">
                  No opponents yet. Add one on the web, then upload their film here.
                </Text>
              </Card>
            ) : (
              (opponents.data?.opponents ?? []).map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => setOpponentId(o.id)}
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
              ))
            )}
          </Section>
        ) : null}

        {/* 5. Title */}
        <Section title="Title">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Bulldogs vs Wildcats — Week 3"
            placeholderTextColor={theme.colors.textSecondary}
            style={[
              styles.input,
              { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md },
            ]}
          />
        </Section>

        {/* 6. Connection guidance */}
        {isLarge ? (
          <Card style={{ marginTop: 16, borderColor: theme.colors.warning }}>
            <Text role="label">Large file — {formatBytes(file?.size ?? 0)}</Text>
            <Text role="metadata" color="textSecondary" style={{ marginTop: 4 }}>
              We recommend Wi-Fi for full games. The upload resumes automatically if it’s
              interrupted, and keeps going while you use the rest of the app.
            </Text>
          </Card>
        ) : null}

        {/* 7. Start */}
        <View style={{ marginTop: 20 }}>
          <Button label="Start upload" onPress={start} disabled={!file} />
        </View>
        <Text role="metadata" color="textSecondary" align="center" style={{ marginTop: 12 }}>
          {Platform.OS === 'ios' ? 'Uploads continue in the app.' : 'Keep the app open while uploading large files.'}
        </Text>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 16 },
  pick: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8 },
});
