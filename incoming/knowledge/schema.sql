-- 1. 启用必要的扩展
create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- 2. 文学知识库主表 (存储作品元数据、主题、技法与教学Prompt)
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
    created_at timestamp with time zone default now()
);

-- 3. 轻量级 RAG 文本分块表 (用于创作者写作时检索匹配参考片段)
create table if not exists public.kb_chunks (
    id uuid primary key default uuid_generate_v4(),
    work_id text references public.kb_works(id) on delete cascade,
    chunk_type text not null, -- 'text_sample', 'technique_explanation', 'case_study'
    content text not null,
    metadata jsonb default '{}'::jsonb,
    embedding vector(384) -- 推荐轻量级 384 维向量 (极省 Supabase 存储)
);

-- 4. 建立轻量级索引
create index if not exists idx_kb_works_genre on public.kb_works(genre);
create index if not exists idx_kb_chunks_work on public.kb_chunks(work_id);
create index if not exists idx_kb_chunks_type on public.kb_chunks(chunk_type);

-- 5. 向量检索函数 (Cosine Distance)
create or replace function match_literature_knowledge (
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  work_id text,
  chunk_type text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    kb_chunks.id,
    kb_chunks.work_id,
    kb_chunks.chunk_type,
    kb_chunks.content,
    1 - (kb_chunks.embedding <=> query_embedding) as similarity
  from kb_chunks
  where 1 - (kb_chunks.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;