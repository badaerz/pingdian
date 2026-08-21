-- Story Forge v1.2 stores all user-created work in the user's browser only.
-- Applying this migration permanently removes legacy cloud-synced user data.
-- The public/authorized literature knowledge tables remain available for RAG.

drop table if exists public.ai_runs;
drop table if exists public.training_attempts;
drop table if exists public.projects;
