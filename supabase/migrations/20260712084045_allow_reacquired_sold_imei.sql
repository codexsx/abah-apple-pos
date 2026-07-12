drop index if exists public.stock_items_imei_unique;

create unique index stock_items_active_imei_unique
  on public.stock_items using btree (imei)
  where imei is not null and status <> 'TERJUAL';

comment on index public.stock_items_active_imei_unique is
  'Allows sold historical stock rows to keep their IMEI while enforcing one active stock row per IMEI.';
