import type { VideoStatus } from '@/types/domain';

/**
 * Coach-friendly processing status labels. Mirrors the pipeline stages from
 * CLAUDE.md. `processing_status` is the worker's granular step; `status` is the
 * coarse video state. Never show a raw enum to a coach.
 */
const STEP_LABELS: Record<string, string> = {
  queued: 'Queued',
  extract_metadata: 'Preparing film',
  preparing: 'Preparing film',
  extract_frames: 'Extracting frames',
  extracting_frames: 'Extracting frames',
  building_timeline: 'Building timeline',
  detect_play_sequences: 'Finding plays',
  finding_plays: 'Finding plays',
  reviewing_evidence: 'Reviewing evidence',
  analyze_sequences: 'Analyzing assignments',
  detecting_tendencies: 'Detecting tendencies',
  generate_report: 'Creating report',
  creating_report: 'Creating report',
  completed: 'Complete',
};

export interface StatusView {
  label: string;
  tone: 'neutral' | 'active' | 'success' | 'warning' | 'error';
  /** True while the server is actively working — the only case worth polling. */
  isActive: boolean;
}

export function videoStatusView(
  status: VideoStatus | null | undefined,
  processingStep?: string | null,
): StatusView {
  switch (status) {
    case 'uploaded':
      return { label: 'Uploaded', tone: 'neutral', isActive: true };
    case 'processing':
      return {
        label: processingStep ? (STEP_LABELS[processingStep] ?? 'Processing') : 'Processing',
        tone: 'active',
        isActive: true,
      };
    case 'partially_ready':
      return { label: 'Partially ready', tone: 'active', isActive: true };
    case 'ready_for_review':
      return { label: 'Ready for review', tone: 'success', isActive: false };
    case 'analysis_complete':
      return { label: 'Analysis complete', tone: 'success', isActive: false };
    case 'failed':
      return { label: 'Needs attention', tone: 'error', isActive: false };
    default:
      return { label: 'Unknown', tone: 'neutral', isActive: false };
  }
}

export function stepLabel(step: string | null | undefined): string {
  if (!step) return '';
  return STEP_LABELS[step] ?? step.replace(/_/g, ' ');
}
