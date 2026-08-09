import React, { useMemo, useState } from 'react';
import { View, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  TopBar,
  Text,
  Card,
  Row,
  Button,
  UploadProgress,
  StatusBadge,
  EmptyState,
  ConfirmationSheet,
} from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useUploadStore } from '@/stores/uploadStore';
import { cancelUpload, retryUpload } from '@/features/uploads/UploadRunner';
import type { StatusView } from '@/utils/status';
import type { UploadItem } from '@/stores/uploadStore';

export default function UploadProgressScreen() {
  const router = useRouter();
  const items = useUploadStore((s) => s.items);
  const remove = useUploadStore((s) => s.remove);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const list = useMemo(
    () => Object.values(items).sort((a, b) => b.createdAt - a.createdAt),
    [items],
  );

  return (
    <>
      <TopBar title="Uploads" />
      {list.length === 0 ? (
        <Screen>
          <EmptyState
            title="No uploads"
            message="Start an upload from the Film tab."
            actionLabel="Upload film"
            onAction={() => router.replace('/(app)/upload')}
          />
        </Screen>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <UploadCard
              item={item}
              onCancel={() => setCancelId(item.id)}
              onRetry={() => retryUpload(item.id)}
              onDismiss={() => remove(item.id)}
              onOpen={item.videoId ? () => router.replace(`/(app)/film/${item.videoId}`) : undefined}
            />
          )}
        />
      )}

      <ConfirmationSheet
        visible={cancelId !== null}
        onClose={() => setCancelId(null)}
        title="Cancel this upload?"
        message="Progress so far will be discarded."
        confirmLabel="Cancel upload"
        destructive
        onConfirm={() => {
          if (cancelId) cancelUpload(cancelId);
        }}
      />
    </>
  );
}

function UploadCard({
  item,
  onCancel,
  onRetry,
  onDismiss,
  onOpen,
}: {
  item: UploadItem;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  onOpen?: () => void;
}) {
  const theme = useTheme();
  const status = statusView(item.status);

  return (
    <Card style={{ marginBottom: 10 }}>
      <Row justify="space-between">
        <Text role="label" numberOfLines={1} style={{ flex: 1 }}>
          {item.title}
        </Text>
        <StatusBadge status={status} />
      </Row>

      {item.status === 'uploading' || item.status === 'queued' ? (
        <View style={{ marginTop: 12 }}>
          <UploadProgress
            progress={item.fileSize ? item.bytesUploaded / item.fileSize : 0}
            bytesUploaded={item.bytesUploaded}
            bytesTotal={item.fileSize}
          />
          <View style={{ marginTop: 12 }}>
            <Button label="Cancel" variant="ghost" haptic={null} onPress={onCancel} />
          </View>
        </View>
      ) : null}

      {item.status === 'failed' ? (
        <View style={{ marginTop: 8 }}>
          <Text role="metadata" style={{ color: theme.colors.error }}>
            {item.error ?? 'Upload failed'}
          </Text>
          <Row gap={10} style={{ marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Button label="Retry" variant="secondary" onPress={onRetry} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Dismiss" variant="ghost" haptic={null} onPress={onDismiss} />
            </View>
          </Row>
        </View>
      ) : null}

      {item.status === 'completed' ? (
        <Row gap={10} style={{ marginTop: 12 }}>
          {onOpen ? (
            <View style={{ flex: 1 }}>
              <Button label="Open film" onPress={onOpen} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button label="Dismiss" variant="ghost" haptic={null} onPress={onDismiss} />
          </View>
        </Row>
      ) : null}

      {item.status === 'cancelled' ? (
        <Button label="Remove" variant="ghost" haptic={null} onPress={onDismiss} style={{ marginTop: 8 }} />
      ) : null}
    </Card>
  );
}

function statusView(s: UploadItem['status']): StatusView {
  switch (s) {
    case 'uploading':
      return { label: 'Uploading', tone: 'active', isActive: true };
    case 'queued':
      return { label: 'Queued', tone: 'neutral', isActive: true };
    case 'completed':
      return { label: 'Uploaded', tone: 'success', isActive: false };
    case 'failed':
      return { label: 'Failed', tone: 'error', isActive: false };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral', isActive: false };
    default:
      return { label: s, tone: 'neutral', isActive: false };
  }
}
