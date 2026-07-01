create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  media_path text not null unique,
  media_type text not null default 'image',
  caption text,
  width integer,
  height integer,
  size_bytes integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  deleted_at timestamptz,
  constraint stories_media_type_check check (media_type in ('image')),
  constraint stories_caption_length check (caption is null or char_length(caption) <= 160),
  constraint stories_dimensions_positive check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  constraint stories_size_positive check (size_bytes is null or size_bytes > 0),
  constraint stories_expiry_window check (expires_at <= created_at + interval '25 hours')
);

create index if not exists stories_active_idx
  on public.stories (expires_at desc, created_at desc)
  where deleted_at is null;

create index if not exists stories_author_created_idx
  on public.stories (author_id, created_at desc);

alter table public.stories enable row level security;

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index if not exists story_views_viewer_idx
  on public.story_views (viewer_id, viewed_at desc);

alter table public.story_views enable row level security;

grant select, insert, update, delete on public.stories to authenticated;
grant select, insert, update, delete on public.story_views to authenticated;

drop policy if exists "Authenticated read active stories" on public.stories;
create policy "Authenticated read active stories"
  on public.stories
  for select
  to authenticated
  using (deleted_at is null and expires_at > now());

drop policy if exists "Users insert own stories" on public.stories;
create policy "Users insert own stories"
  on public.stories
  for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and deleted_at is null
    and media_type = 'image'
    and expires_at <= now() + interval '25 hours'
  );

drop policy if exists "Users update own stories or managers moderate" on public.stories;
create policy "Users update own stories or managers moderate"
  on public.stories
  for update
  to authenticated
  using ((select auth.uid()) = author_id or (select private.has_permission('manage_users')))
  with check ((select auth.uid()) = author_id or (select private.has_permission('manage_users')));

drop policy if exists "Users delete own stories or managers moderate" on public.stories;
create policy "Users delete own stories or managers moderate"
  on public.stories
  for delete
  to authenticated
  using ((select auth.uid()) = author_id or (select private.has_permission('manage_users')));

drop policy if exists "Users read own story views" on public.story_views;
create policy "Users read own story views"
  on public.story_views
  for select
  to authenticated
  using ((select auth.uid()) = viewer_id);

drop policy if exists "Users insert own story views" on public.story_views;
create policy "Users insert own story views"
  on public.story_views
  for insert
  to authenticated
  with check ((select auth.uid()) = viewer_id);

drop policy if exists "Users update own story views" on public.story_views;
create policy "Users update own story views"
  on public.story_views
  for update
  to authenticated
  using ((select auth.uid()) = viewer_id)
  with check ((select auth.uid()) = viewer_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-stories',
  'store-stories',
  false,
  4194304,
  array['image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated read store stories" on storage.objects;
create policy "Authenticated read store stories"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'store-stories'
    and exists (
      select 1
      from public.stories s
      where s.media_path = storage.objects.name
        and s.deleted_at is null
        and s.expires_at > now()
    )
  );

drop policy if exists "Users insert own store stories" on storage.objects;
create policy "Users insert own store stories"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-stories'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete own store stories or managers moderate" on storage.objects;
create policy "Users delete own store stories or managers moderate"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'store-stories'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.has_permission('manage_users'))
    )
  );

create or replace function private.cleanup_expired_stories()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_deleted integer := 0;
begin
  with marked as (
    update public.stories
    set deleted_at = now()
    where deleted_at is null
      and expires_at <= now()
    returning id, media_path
  ),
  expired as (
    select id, media_path from marked
    union
    select id, media_path
    from public.stories
    where deleted_at is not null
      and expires_at <= now()
  ),
  removed_objects as (
    delete from storage.objects o
    using expired e
    where o.bucket_id = 'store-stories'
      and o.name = e.media_path
    returning 1
  ),
  removed_stories as (
    delete from public.stories s
    using expired e
    where s.id = e.id
    returning 1
  )
  select count(*) into v_deleted from removed_stories;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function private.cleanup_expired_stories() from public, anon, authenticated;
grant execute on function private.cleanup_expired_stories() to authenticated;

create or replace function public.cleanup_expired_stories()
returns integer
language sql
set search_path = public
as $$
  select private.cleanup_expired_stories();
$$;

grant execute on function public.cleanup_expired_stories() to authenticated;

create or replace function private.get_story_authors(p_author_ids uuid[])
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
      from public.stories s
      where s.author_id = p.id
        and s.deleted_at is null
        and s.expires_at > now()
    );
$$;

revoke all on function private.get_story_authors(uuid[]) from public, anon, authenticated;
grant execute on function private.get_story_authors(uuid[]) to authenticated;

create or replace function public.get_story_authors(p_author_ids uuid[])
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
  from private.get_story_authors(p_author_ids);
$$;

grant execute on function public.get_story_authors(uuid[]) to authenticated;
