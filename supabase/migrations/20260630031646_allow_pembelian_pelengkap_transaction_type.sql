alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
  check (
    type = any (
      array[
        'Penjualan'::text,
        'Pembelian'::text,
        'Pembelian Pelengkap'::text,
        'Servis'::text,
        'Pengeluaran'::text,
        'Tukar Tambah'::text,
        'Pemasukan Lain'::text,
        'Upah Servis'::text
      ]
    )
  );
