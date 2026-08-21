create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.projects (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  document jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text references public.projects(id) on delete set null,
  task text not null,
  mode text not null check (mode in ('live', 'demo')),
  request jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.training_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null,
  answer text not null,
  feedback jsonb not null default '{}'::jsonb,
  title text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_works (
  id text primary key,
  title text not null,
  author text not null,
  era text not null,
  genre text not null,
  copyright jsonb not null default '{}'::jsonb,
  core_summary text not null,
  themes jsonb not null default '{}'::jsonb,
  imagery_and_symbols jsonb not null default '[]'::jsonb,
  techniques_and_craft jsonb not null default '{}'::jsonb,
  plot_blueprint jsonb not null default '[]'::jsonb,
  character_graph jsonb not null default '{}'::jsonb,
  why_write_this_way_case jsonb not null default '{}'::jsonb,
  training_prompts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references public.kb_works(id) on delete cascade,
  chunk_type text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(384),
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_id_idx on public.projects(owner_id);
create index if not exists ai_runs_owner_id_idx on public.ai_runs(owner_id);
create index if not exists training_attempts_owner_id_idx on public.training_attempts(owner_id);
create index if not exists kb_works_era_idx on public.kb_works(era);
create index if not exists kb_chunks_work_id_idx on public.kb_chunks(work_id);
create index if not exists kb_chunks_metadata_idx on public.kb_chunks using gin(metadata);

alter table public.projects enable row level security;
alter table public.ai_runs enable row level security;
alter table public.training_attempts enable row level security;
alter table public.kb_works enable row level security;
alter table public.kb_chunks enable row level security;

create policy "projects owner access" on public.projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "ai runs owner access" on public.ai_runs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "training owner access" on public.training_attempts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "knowledge public read" on public.kb_works for select to anon, authenticated using (true);
create policy "knowledge chunks public read" on public.kb_chunks for select to anon, authenticated using (true);

grant select on public.kb_works, public.kb_chunks to anon, authenticated;
