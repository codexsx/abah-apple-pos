create table if not exists public.story_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint story_comments_body_length check (
    char_length(btrim(body)) between 1 and 240
  )
);

create index if not exists story_comments_story_created_idx
  on public.story_comments (story_id, created_at)
  where deleted_at is null;

create index if not exists story_comments_author_created_idx
  on public.story_comments (author_id, created_at desc);

alter table public.story_comments enable row level security;

grant select, insert, delete on public.story_comments to authenticated;

drop policy if exists "Authenticated read active story comments" on public.story_comments;
create policy "Authenticated read active story comments"
  on public.story_comments
  for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from public.stories s
      where s.id = story_comments.story_id
        and s.deleted_at is null
        and s.expires_at > now()
    )
  );

drop policy if exists "Users insert own active story comments" on public.story_comments;
create policy "Users insert own active story comments"
  on public.story_comments
  for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and deleted_at is null
    and exists (
      select 1
      from public.stories s
      where s.id = story_comments.story_id
        and s.deleted_at is null
        and s.expires_at > now()
    )
  );

drop policy if exists "Users delete own story comments or managers moderate" on public.story_comments;
create policy "Users delete own story comments or managers moderate"
  on public.story_comments
  for delete
  to authenticated
  using (
    (select auth.uid()) = author_id
    or (select private.has_permission('manage_users'))
  );

create or replace function private.get_story_comment_authors(p_author_ids uuid[])
returns table (
  id uuid,
  name text,
  role text,
  initials text,
  avatar_url text,
  avatar_crop_x numeric,
  avatar_crop_y numeric,
  avatar_zoom numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.role,
    p.initials,
    p.avatar_url,
    p.avatar_crop_x,
    p.avatar_crop_y,
    p.avatar_zoom
  from public.profiles p
  where p.id = any(coalesce(p_author_ids, array[]::uuid[]))
    and p.is_hidden_owner = false
    and exists (
      select 1
      from public.story_comments c
      join public.stories s on s.id = c.story_id
      where c.author_id = p.id
        and c.deleted_at is null
        and s.deleted_at is null
        and s.expires_at > now()
    );
$$;

revoke all on function private.get_story_comment_authors(uuid[]) from public, anon, authenticated;
grant execute on function private.get_story_comment_authors(uuid[]) to authenticated;

create or replace function public.get_story_comment_authors(p_author_ids uuid[])
returns table (
  id uuid,
  name text,
  role text,
  initials text,
  avatar_url text,
  avatar_crop_x numeric,
  avatar_crop_y numeric,
  avatar_zoom numeric
)
language sql
stable
set search_path = public
as $$
  select *
  from private.get_story_comment_authors(p_author_ids);
$$;

grant execute on function public.get_story_comment_authors(uuid[]) to authenticated;

notify pgrst, 'reload schema';
