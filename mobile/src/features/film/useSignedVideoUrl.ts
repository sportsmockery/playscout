import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

const VIDEO_BUCKET = 'videos';

/**
 * Resolves a short-lived signed playback URL for a stored video. Uses the
 * user's own session, so storage RLS governs access — a coach can only play
 * film on a team they belong to. Signed URLs are never logged or persisted.
 */
export function useSignedVideoUrl(storagePath: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-video', storagePath],
    enabled: !!storagePath,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(VIDEO_BUCKET)
        .createSignedUrl(storagePath as string, 60 * 60);
      if (error || !data?.signedUrl) throw new Error('Could not load video');
      return data.signedUrl;
    },
  });
}
