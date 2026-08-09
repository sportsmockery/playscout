import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * AsyncStorage-backed tus URL storage so resumable uploads survive app restarts.
 * tus-js-client's default RN storage is in-memory only — this persists the
 * created upload URL keyed by fingerprint, which is what makes "resume after the
 * app was killed" actually work.
 *
 * Implements tus-js-client's UrlStorage shape without importing its private
 * types (kept structural to avoid coupling to internal type paths).
 */
interface PreviousUpload {
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  uploadUrl?: string | null;
  parallelUploadUrls?: string[] | null;
  urlStorageKey?: string;
}

const PREFIX = 'tus::';

export class AsyncUrlStorage {
  async findAllUploads(): Promise<PreviousUpload[]> {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    const entries = await AsyncStorage.multiGet(keys);
    return entries
      .map(([key, value]) => (value ? ({ ...JSON.parse(value), urlStorageKey: key } as PreviousUpload) : null))
      .filter((u): u is PreviousUpload => u !== null);
  }

  async findUploadsByFingerprint(fingerprint: string): Promise<PreviousUpload[]> {
    const key = PREFIX + fingerprint;
    const value = await AsyncStorage.getItem(key);
    if (!value) return [];
    return [{ ...(JSON.parse(value) as PreviousUpload), urlStorageKey: key }];
  }

  async removeUpload(urlStorageKey: string): Promise<void> {
    await AsyncStorage.removeItem(urlStorageKey);
  }

  async addUpload(fingerprint: string, upload: PreviousUpload): Promise<string> {
    const key = PREFIX + fingerprint;
    await AsyncStorage.setItem(key, JSON.stringify(upload));
    return key;
  }
}
