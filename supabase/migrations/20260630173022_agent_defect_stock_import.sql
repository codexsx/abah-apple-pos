create table if not exists public.stock_import_batches (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete set null,
  file_name text not null default '',
  import_mode text not null default 'agent_defect_units',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  warning_rows integer not null default 0,
  error_rows integer not null default 0,
  total_cost bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.stock_items
  add column if not exists battery_health integer,
  add column if not exists carrier text not null default '',
  add column if not exists defect_description text not null default '',
  add column if not exists source_agent_id uuid references public.agents(id) on delete set null,
  add column if not exists import_batch_id uuid references public.stock_import_batches(id) on delete set null,
  add column if not exists source_row_number integer,
  add column if not exists import_note text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stock_items_battery_health_range'
  ) then
    alter table public.stock_items
      add constraint stock_items_battery_health_range
      check (battery_health is null or (battery_health between 0 and 100));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'stock_import_batches_import_mode_check'
  ) then
    alter table public.stock_import_batches
      add constraint stock_import_batches_import_mode_check
      check (import_mode in ('agent_defect_units'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'stock_import_batches_row_counts_check'
  ) then
    alter table public.stock_import_batches
      add constraint stock_import_batches_row_counts_check
      check (
        total_rows >= 0
        and valid_rows >= 0
        and warning_rows >= 0
        and error_rows >= 0
        and total_cost >= 0
      );
  end if;
end $$;

create index if not exists stock_items_source_agent_id_idx
  on public.stock_items(source_agent_id);

create index if not exists stock_items_import_batch_id_idx
  on public.stock_items(import_batch_id);

create index if not exists stock_import_batches_agent_id_idx
  on public.stock_import_batches(agent_id);

alter table public.stock_import_batches enable row level security;

drop policy if exists "Stock read import batches" on public.stock_import_batches;
create policy "Stock read import batches"
  on public.stock_import_batches
  for select
  to authenticated
  using (private.has_permission('stok') or private.has_permission('agen'));

drop policy if exists "Stock insert import batches" on public.stock_import_batches;
create policy "Stock insert import batches"
  on public.stock_import_batches
  for insert
  to authenticated
  with check (private.has_permission('stok') or private.has_permission('agen'));

drop policy if exists "Stock update import batches" on public.stock_import_batches;
create policy "Stock update import batches"
  on public.stock_import_batches
  for update
  to authenticated
  using (private.has_permission('stok') or private.has_permission('agen'))
  with check (private.has_permission('stok') or private.has_permission('agen'));

drop policy if exists "Stock delete import batches" on public.stock_import_batches;
create policy "Stock delete import batches"
  on public.stock_import_batches
  for delete
  to authenticated
  using (private.has_permission('stok') or private.has_permission('agen'));

grant select, insert, update, delete on public.stock_import_batches to authenticated;

create or replace function public.record_agent_defect_stock_import(
  p_agent_id uuid,
  p_file_name text,
  p_rows jsonb,
  p_summary jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  v_batch_id uuid;
  v_total_rows integer;
  v_valid_rows integer;
  v_warning_rows integer;
  v_error_rows integer;
  v_total_cost bigint;
  v_bad_count integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import rows must be a JSON array';
  end if;

  select count(*) into v_total_rows
  from jsonb_array_elements(p_rows);

  if v_total_rows = 0 then
    raise exception 'Tidak ada baris valid untuk diimport';
  end if;

  select count(*) into v_bad_count
  from jsonb_array_elements(p_rows) as r(row)
  where coalesce(r.row->>'model', '') = ''
    or coalesce(nullif(r.row->>'count', '')::integer, 0) < 1
    or coalesce(nullif(r.row->>'cost_price', '')::bigint, -1) < 0
    or coalesce(nullif(r.row->>'price', '')::bigint, 0) < 0
    or coalesce(r.row->>'status', '') not in ('READY','SERVIS','KANIBAL','RUSAK','TERJUAL')
    or (
      nullif(r.row->>'battery_health', '') is not null
      and (r.row->>'battery_health')::integer not between 0 and 100
    )
    or (
      coalesce((r.row->>'has_imei')::boolean, false)
      and coalesce(r.row->>'imei', '') !~ '^[0-9]{15}$'
    );

  if v_bad_count > 0 then
    raise exception 'Ada % baris import yang tidak valid', v_bad_count;
  end if;

  select count(*) into v_bad_count
  from (
    select r.row->>'imei' as imei
    from jsonb_array_elements(p_rows) as r(row)
    where coalesce(r.row->>'imei', '') <> ''
    group by r.row->>'imei'
    having count(*) > 1
  ) d;

  if v_bad_count > 0 then
    raise exception 'Ada % IMEI duplikat di file import', v_bad_count;
  end if;

  select count(*) into v_bad_count
  from jsonb_array_elements(p_rows) as r(row)
  join public.stock_items s on s.imei = nullif(r.row->>'imei', '')
  where coalesce(r.row->>'imei', '') <> '';

  if v_bad_count > 0 then
    raise exception 'Ada % IMEI yang sudah ada di stok', v_bad_count;
  end if;

  select
    coalesce((p_summary->>'total_rows')::integer, v_total_rows),
    count(*),
    count(*) filter (where jsonb_array_length(coalesce(row->'warnings', '[]'::jsonb)) > 0),
    coalesce(sum(coalesce(nullif(row->>'cost_price', '')::bigint, 0)), 0)
  into v_total_rows, v_valid_rows, v_warning_rows, v_total_cost
  from jsonb_array_elements(p_rows) as r(row);

  v_error_rows := coalesce((p_summary->>'error_rows')::integer, 0);

  insert into public.stock_import_batches (
    agent_id,
    file_name,
    import_mode,
    total_rows,
    valid_rows,
    warning_rows,
    error_rows,
    total_cost,
    metadata
  ) values (
    p_agent_id,
    coalesce(p_file_name, ''),
    'agent_defect_units',
    v_total_rows,
    v_valid_rows,
    v_warning_rows,
    v_error_rows,
    v_total_cost,
    coalesce(p_summary, '{}'::jsonb)
  ) returning id into v_batch_id;

  insert into public.stock_items (
    model,
    capacity,
    condition,
    color,
    imei,
    has_imei,
    status,
    count,
    price,
    cost_price,
    battery_health,
    carrier,
    defect_description,
    source_agent_id,
    import_batch_id,
    source_row_number,
    import_note
  )
  select
    row->>'model',
    coalesce(row->>'capacity', ''),
    coalesce(nullif(row->>'condition', ''), 'Second Minus'),
    coalesce(row->>'color', ''),
    nullif(row->>'imei', ''),
    coalesce((row->>'has_imei')::boolean, false),
    coalesce(nullif(row->>'status', ''), 'READY'),
    coalesce(nullif(row->>'count', '')::integer, 1),
    coalesce(nullif(row->>'price', '')::bigint, 0),
    coalesce(nullif(row->>'cost_price', '')::bigint, 0),
    nullif(row->>'battery_health', '')::integer,
    coalesce(row->>'carrier', ''),
    coalesce(row->>'defect_description', ''),
    p_agent_id,
    v_batch_id,
    nullif(row->>'source_row_number', '')::integer,
    coalesce(row->>'import_note', '')
  from jsonb_array_elements(p_rows) as r(row);

  return v_batch_id;
end;
$$;

grant execute on function public.record_agent_defect_stock_import(uuid, text, jsonb, jsonb) to authenticated;
