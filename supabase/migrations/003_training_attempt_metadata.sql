alter table public.training_attempts
  add column if not exists attempt_no integer,
  add column if not exists previous_attempt_id text,
  add column if not exists scores jsonb,
  add column if not exists evidence_quotes jsonb,
  add column if not exists source_diagnostic_id text,
  add column if not exists reference_id text;
