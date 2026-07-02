revoke all on public.story_comments from anon;
grant select, insert, delete on public.story_comments to authenticated;

revoke all on function public.get_story_comment_authors(uuid[]) from public, anon;
grant execute on function public.get_story_comment_authors(uuid[]) to authenticated;

notify pgrst, 'reload schema';
