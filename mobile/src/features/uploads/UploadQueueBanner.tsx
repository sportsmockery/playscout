import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Text, Row, UploadProgress } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import type { UploadItem } from '@/stores/uploadStore';

/** Compact persistent view of in-flight uploads, shown atop the Film list. */
export function UploadQueueBanner({ uploads }: { uploads: UploadItem[] }) {
  const theme = useTheme();
  const router = useRouter();
  if (uploads.length === 0) return null;
  const head = uploads[0];
  if (!head) return null;

  return (
    <Card>
      <Row justify="space-between">
        <Text role="label" numberOfLines={1} style={{ flex: 1 }}>
          {head.status === 'failed' ? 'Upload needs attention' : 'Uploading'}
          {uploads.length > 1 ? ` · ${uploads.length} in queue` : ''}
        </Text>
        <Text role="label" color="gold" onPress={() => router.push('/(app)/upload/progress')}>
          Details
        </Text>
      </Row>
      <Text role="metadata" color="textSecondary" numberOfLines={1} style={{ marginTop: 2 }}>
        {head.title}
      </Text>
      <View style={{ marginTop: 10 }}>
        {head.status === 'failed' ? (
          <Text role="metadata" style={{ color: theme.colors.error }}>
            {head.error ?? 'Upload failed'}
          </Text>
        ) : (
          <UploadProgress
            progress={head.fileSize ? head.bytesUploaded / head.fileSize : 0}
            bytesUploaded={head.bytesUploaded}
            bytesTotal={head.fileSize}
          />
        )}
      </View>
    </Card>
  );
}
