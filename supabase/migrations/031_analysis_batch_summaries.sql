-- 031_analysis_batch_summaries.sql
--
-- Cumulative reports for analysis batches.
--
-- A coach who queues 40 clips does not want 40 verdicts on 40 pages; they
-- want to know what keeps happening. Once every job in a batch reaches a
-- terminal state, a synthesis pass reads the per-clip results and writes one
-- combined report here — including a one-line comment on every individual
-- clip — which the batch report page renders as a single film session.
--
-- The summary lives on the batch rather than in position_analysis_results
-- because it is not an analysis of a video: it has no frames, no single
-- video_id, and grading it on the 0-100 module scale would be a category
-- error.

alter table public.analysis_batches
  -- not_applicable: a one-clip batch has nothing to synthesize — its single
  -- report already IS the whole story, so we skip the extra model call.
  add column if not exists summary_status text not null default 'pending'
    check (summary_status in ('pending', 'running', 'complete', 'failed', 'not_applicable')),
  add column if not exists summary jsonb,
  add column if not exists summary_error text,
  add column if not exists summary_model text,
  add column if not exists summarized_at timestamptz;

-- Lets a runner find batches whose jobs are done but whose report isn't
-- written yet, without scanning every batch the org has ever run.
create index if not exists analysis_batches_summary_pending_idx
  on public.analysis_batches (summary_status)
  where summary_status in ('pending', 'running');

-- Backfill: batches that finished before this migration existed have nothing
-- to summarize retroactively (their coach has already moved on), so mark them
-- so they don't all queue a model call the moment this deploys.
update public.analysis_batches
  set summary_status = 'not_applicable'
  where summary_status = 'pending'
    and status in ('completed', 'completed_with_errors', 'failed', 'cancelled');
