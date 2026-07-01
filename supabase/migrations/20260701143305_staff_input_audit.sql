alter table public.transactions
  add column if not exists staff_id uuid references public.profiles(id);

alter table public.agent_transactions
  add column if not exists staff_id uuid references public.profiles(id);

alter table public.service_records
  add column if not exists created_by uuid references public.profiles(id);

alter table public.daily_closings
  add column if not exists closed_by uuid references public.profiles(id);

create index if not exists transactions_staff_input_idx
  on public.transactions(staff_id, created_at desc);

create index if not exists agent_transactions_staff_input_idx
  on public.agent_transactions(staff_id, created_at desc);

create index if not exists service_records_created_by_idx
  on public.service_records(created_by, created_at desc);

create index if not exists daily_closings_closed_by_idx
  on public.daily_closings(closed_by, closing_date desc);

create or replace function private.set_transaction_staff_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.staff_id := auth.uid();
  end if;

  return new;
end;
$$;

create or replace function private.set_agent_transaction_staff_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.staff_id := auth.uid();
  end if;

  return new;
end;
$$;

create or replace function private.set_service_record_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;

  return new;
end;
$$;

create or replace function private.set_daily_closing_closed_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.closed_by := auth.uid();
  end if;

  return new;
end;
$$;

revoke all on function private.set_transaction_staff_id() from public, anon, authenticated;
revoke all on function private.set_agent_transaction_staff_id() from public, anon, authenticated;
revoke all on function private.set_service_record_created_by() from public, anon, authenticated;
revoke all on function private.set_daily_closing_closed_by() from public, anon, authenticated;

drop trigger if exists set_transaction_staff_id on public.transactions;
create trigger set_transaction_staff_id
  before insert on public.transactions
  for each row
  execute function private.set_transaction_staff_id();

drop trigger if exists set_agent_transaction_staff_id on public.agent_transactions;
create trigger set_agent_transaction_staff_id
  before insert on public.agent_transactions
  for each row
  execute function private.set_agent_transaction_staff_id();

drop trigger if exists set_service_record_created_by on public.service_records;
create trigger set_service_record_created_by
  before insert on public.service_records
  for each row
  execute function private.set_service_record_created_by();

drop trigger if exists set_daily_closing_closed_by on public.daily_closings;
create trigger set_daily_closing_closed_by
  before insert on public.daily_closings
  for each row
  execute function private.set_daily_closing_closed_by();
