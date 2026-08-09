import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore-backed storage adapter for the Supabase auth session.
 *
 * SecureStore caps a single value at ~2048 bytes, but a Supabase session
 * (access + refresh token + user) routinely exceeds that. This adapter
 * transparently chunks large values across `${key}.0`, `${key}.1`, … keys with
 * a `${key}.__len` counter, so the whole session stays inside the OS keychain /
 * keystore — no plaintext tokens in AsyncStorage.
 */
const CHUNK_SIZE = 1800;
const LEN_SUFFIX = '.__len';

async function clearChunks(key: string, count: number): Promise<void> {
  const ops: Promise<void>[] = [SecureStore.deleteItemAsync(key + LEN_SUFFIX)];
  for (let i = 0; i < count; i++) ops.push(SecureStore.deleteItemAsync(`${key}.${i}`));
  await Promise.all(ops).catch(() => {});
}

export const SecureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const lenRaw = await SecureStore.getItemAsync(key + LEN_SUFFIX);
    if (lenRaw == null) {
      // Non-chunked legacy value (small) — read directly.
      return SecureStore.getItemAsync(key);
    }
    const count = parseInt(lenRaw, 10);
    if (!Number.isFinite(count) || count <= 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part == null) return null; // corrupt / partial write
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    // Remove any previous representation first to avoid stale chunks.
    const prevLen = await SecureStore.getItemAsync(key + LEN_SUFFIX);
    if (prevLen != null) await clearChunks(key, parseInt(prevLen, 10) || 0);
    await SecureStore.deleteItemAsync(key).catch(() => {});

    const chunkCount = Math.ceil(value.length / CHUNK_SIZE) || 1;
    const writes: Promise<void>[] = [];
    for (let i = 0; i < chunkCount; i++) {
      writes.push(SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)));
    }
    writes.push(SecureStore.setItemAsync(key + LEN_SUFFIX, String(chunkCount)));
    await Promise.all(writes);
  },

  async removeItem(key: string): Promise<void> {
    const lenRaw = await SecureStore.getItemAsync(key + LEN_SUFFIX);
    await clearChunks(key, lenRaw ? parseInt(lenRaw, 10) || 0 : 0);
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};
