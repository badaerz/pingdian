create index if not exists kb_chunks_metadata_idx
  on public.kb_chunks using gin (metadata);

alter table public.kb_works
  add column if not exists source_status text not null default 'pending';

update public.kb_works
set source_status = copyright->>'source_status'
where copyright->>'source_status' in ('verified', 'pending', 'summary_only');

update public.kb_works
set source_status = 'pending'
where source_status not in ('verified', 'pending', 'summary_only');

alter table public.kb_works
  drop constraint if exists kb_works_source_status_check;

alter table public.kb_works
  add constraint kb_works_source_status_check
  check (source_status in ('verified', 'pending', 'summary_only'));

alter table public.kb_chunks
  drop constraint if exists kb_chunks_chunk_type_check;

alter table public.kb_chunks
  add constraint kb_chunks_chunk_type_check
  check (chunk_type in ('summary', 'technique_explanation', 'case_excerpt', 'text_sample'))
  not valid;

drop policy if exists "knowledge chunks public read" on public.kb_chunks;

create policy "knowledge chunks public read"
  on public.kb_chunks
  for select
  to anon, authenticated
  using (
    char_length(content) <= 2000
    and chunk_type in ('summary', 'technique_explanation', 'case_excerpt')
  );

create or replace function public.list_public_knowledge_chunks(
  filter_work_ids text[] default null,
  match_count int default 500
)
returns table (
  id uuid,
  work_id text,
  chunk_type text,
  content text,
  metadata jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select chunks.id, chunks.work_id, chunks.chunk_type, chunks.content, chunks.metadata
  from public.kb_chunks as chunks
  where chunks.chunk_type in ('summary', 'technique_explanation', 'case_excerpt')
    and char_length(chunks.content) <= 2000
    and cardinality(coalesce(filter_work_ids, array[]::text[])) <= 100
    and (filter_work_ids is null or chunks.work_id = any(filter_work_ids))
  order by chunks.work_id, chunks.chunk_type, chunks.id
  limit least(greatest(coalesce(match_count, 500), 0), 1000);
$$;

grant execute on function public.list_public_knowledge_chunks(text[], int)
  to anon, authenticated;

create or replace function public.match_literature_knowledge(
  query_embedding vector(384),
  match_threshold float,
  match_count int,
  filter_work_ids text[] default null,
  filter_chunk_types text[] default null
)
returns table (
  id uuid,
  work_id text,
  chunk_type text,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    chunks.id,
    chunks.work_id,
    chunks.chunk_type,
    chunks.content,
    chunks.metadata,
    1 - (chunks.embedding <=> query_embedding) as similarity
  from public.kb_chunks as chunks
  join public.kb_works as works
    on works.id = chunks.work_id
  where chunks.embedding is not null
    and chunks.chunk_type in ('summary', 'technique_explanation', 'case_excerpt')
    and char_length(chunks.content) <= 2000
    and (filter_work_ids is null or chunks.work_id = any(filter_work_ids))
    and (filter_chunk_types is null or chunks.chunk_type = any(filter_chunk_types))
    and cardinality(coalesce(filter_work_ids, array[]::text[])) <= 20
    and cardinality(coalesce(filter_chunk_types, array[]::text[])) <= 20
    and 1 - (chunks.embedding <=> query_embedding) > least(greatest(coalesce(match_threshold, 0.3), -1), 1)
  order by chunks.embedding <=> query_embedding, chunks.id
  limit least(greatest(coalesce(match_count, 5), 0), 8);
$$;

grant execute on function public.match_literature_knowledge(vector, float, int, text[], text[])
  to anon, authenticated;

create or replace function public.match_literature_knowledge_private(
  query_embedding vector(384),
  match_threshold float,
  match_count int,
  filter_work_ids text[] default null,
  filter_chunk_types text[] default null
)
returns table (
  id uuid,
  work_id text,
  chunk_type text,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    chunks.id,
    chunks.work_id,
    chunks.chunk_type,
    chunks.content,
    chunks.metadata,
    1 - (chunks.embedding <=> query_embedding) as similarity
  from public.kb_chunks as chunks
  join public.kb_works as works
    on works.id = chunks.work_id
  where chunks.embedding is not null
    and chunks.chunk_type in ('summary', 'technique_explanation', 'case_excerpt', 'text_sample')
    and char_length(chunks.content) <= 2000
    and (filter_work_ids is null or chunks.work_id = any(filter_work_ids))
    and (filter_chunk_types is null or chunks.chunk_type = any(filter_chunk_types))
    and cardinality(coalesce(filter_work_ids, array[]::text[])) <= 20
    and cardinality(coalesce(filter_chunk_types, array[]::text[])) <= 20
    and (
      chunks.chunk_type in ('summary', 'technique_explanation', 'case_excerpt')
      or (
        chunks.chunk_type = 'text_sample'
        and works.source_status = 'verified'
        and chunks.metadata->>'source_status' = 'verified'
      )
    )
    and 1 - (chunks.embedding <=> query_embedding) > least(greatest(coalesce(match_threshold, 0.3), -1), 1)
  order by chunks.embedding <=> query_embedding, chunks.id
  limit least(greatest(coalesce(match_count, 5), 0), 8);
$$;

revoke all on function public.match_literature_knowledge_private(vector, float, int, text[], text[]) from public;
revoke execute on function public.match_literature_knowledge_private(vector, float, int, text[], text[]) from anon, authenticated;
grant execute on function public.match_literature_knowledge_private(vector, float, int, text[], text[]) to service_role;

create or replace function public.replace_literature_knowledge_chunks(
  seed_work_ids text[],
  seed_chunks jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  if seed_work_ids is null or cardinality(seed_work_ids) = 0 or cardinality(seed_work_ids) > 100 then
    raise exception 'Invalid seed work ids';
  end if;
  if seed_chunks is null or jsonb_typeof(seed_chunks) <> 'array' or jsonb_array_length(seed_chunks) > 1000 then
    raise exception 'Invalid seed chunks';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(seed_chunks) as item
    where item->>'work_id' <> all(seed_work_ids)
      or item->>'chunk_type' not in ('summary', 'technique_explanation', 'case_excerpt', 'text_sample')
      or coalesce(item->>'content', '') = ''
      or char_length(item->>'content') > 2000
      or jsonb_typeof(coalesce(item->'metadata', '{}'::jsonb)) <> 'object'
      or (item ? 'embedding' and (jsonb_typeof(item->'embedding') <> 'array' or jsonb_array_length(item->'embedding') <> 384))
  ) then
    raise exception 'Invalid seed chunk payload';
  end if;

  delete from public.kb_chunks
  where work_id = any(seed_work_ids);

  insert into public.kb_chunks (work_id, chunk_type, content, metadata, embedding)
  select
    item->>'work_id',
    item->>'chunk_type',
    item->>'content',
    coalesce(item->'metadata', '{}'::jsonb),
    case when item ? 'embedding' then (item->>'embedding')::vector(384) else null end
  from jsonb_array_elements(seed_chunks) as item;
end;
$$;

revoke all on function public.replace_literature_knowledge_chunks(text[], jsonb) from public;
grant execute on function public.replace_literature_knowledge_chunks(text[], jsonb) to service_role;

do $$
begin
  begin
    execute 'create index if not exists kb_chunks_embedding_hnsw_idx on public.kb_chunks using hnsw (embedding vector_cosine_ops)';
  exception when others then
    begin
      execute 'create index if not exists kb_chunks_embedding_ivfflat_idx on public.kb_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 1)';
    exception when others then
      raise notice 'No compatible pgvector approximate index is available; exact RPC search remains enabled.';
    end;
  end;
end
$$;
