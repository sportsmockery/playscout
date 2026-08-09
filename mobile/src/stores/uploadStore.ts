import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type UploadStatus = 'queued' | 'uploading' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface UploadItem {
  /** Stable client id, also used to dedupe complete-upload calls. */
  id: string;
  teamId: string;
  title: string;
  fileUri: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  filmType: 'self' | 'opponent';
  opponentId?: string;
  /** Storage object path chosen up front, so a resumed upload targets the same
   * object and completion never creates a duplicate video row. */
  storagePath: string;
  /** tus upload URL once created — enables resume across app launches. */
  tusUrl?: string;
  status: UploadStatus;
  bytesUploaded: number;
  error?: string;
  /** Set once the server has registered the completed upload. */
  videoId?: string;
  createdAt: number;
}

interface UploadState {
  items: Record<string, UploadItem>;
  enqueue: (item: UploadItem) => void;
  update: (id: string, patch: Partial<UploadItem>) => void;
  remove: (id: string) => void;
}

const PERSIST_KEY = 'playscout.uploads';

export const useUploadStore = create<UploadState>()(
  persist(
    (set) => ({
      items: {},
      enqueue: (item) => set((s) => ({ items: { ...s.items, [item.id]: item } })),
      update: (id, patch) =>
        set((s) => (s.items[id] ? { items: { ...s.items, [id]: { ...s.items[id], ...patch } } } : s)),
      remove: (id) =>
        set((s) => {
          const next = { ...s.items };
          delete next[id];
          return { items: next };
        }),
    }),
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist enough to resume — never the file bytes themselves.
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

/** Called on sign-out to purge in-flight upload metadata. */
export async function clearUploadPersistence(): Promise<void> {
  useUploadStore.setState({ items: {} });
  await AsyncStorage.removeItem(PERSIST_KEY);
}

export function selectActiveUploads(items: Record<string, UploadItem>): UploadItem[] {
  return Object.values(items)
    .filter((i) => i.status === 'uploading' || i.status === 'queued' || i.status === 'paused' || i.status === 'failed')
    .sort((a, b) => b.createdAt - a.createdAt);
}
