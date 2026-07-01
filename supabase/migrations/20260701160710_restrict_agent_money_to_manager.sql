create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'MANAJER'
  );
$$;

revoke all on function private.is_manager() from public, anon, authenticated;
grant execute on function private.is_manager() to authenticated;

drop policy if exists "Agen read transactions" on public.agent_transactions;
drop policy if exists "Boss read agent transactions" on public.agent_transactions;
create policy "Boss read agent transactions"
  on public.agent_transactions
  for select
  to authenticated
  using (private.is_manager());

drop policy if exists "Agen update transactions" on public.agent_transactions;
drop policy if exists "Boss update agent transactions" on public.agent_transactions;
create policy "Boss update agent transactions"
  on public.agent_transactions
  for update
  to authenticated
  using (private.is_manager())
  with check (private.is_manager());

drop policy if exists "Agen delete transactions" on public.agent_transactions;
drop policy if exists "Boss delete agent transactions" on public.agent_transactions;
create policy "Boss delete agent transactions"
  on public.agent_transactions
  for delete
  to authenticated
  using (private.is_manager());

notify pgrst, 'reload schema';
