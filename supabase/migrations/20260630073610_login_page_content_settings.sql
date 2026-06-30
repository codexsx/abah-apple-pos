alter table public.company_settings
  add column if not exists login_kicker text not null default 'Smart POS',
  add column if not exists login_badge_label text not null default 'Staff Access',
  add column if not exists login_headline text not null default 'Masuk cepat untuk operasional toko.',
  add column if not exists login_accounts_title text not null default 'Staff Terdaftar',
  add column if not exists login_footer_label text not null default 'Sixcode Smart OS',
  add column if not exists login_feature_one_label text not null default 'Kasir',
  add column if not exists login_feature_two_label text not null default 'Stok',
  add column if not exists login_feature_three_label text not null default 'Servis';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_settings_login_kicker_length'
  ) then
    alter table public.company_settings
      add constraint company_settings_login_kicker_length
      check (char_length(login_kicker) <= 40);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'company_settings_login_badge_length'
  ) then
    alter table public.company_settings
      add constraint company_settings_login_badge_length
      check (char_length(login_badge_label) <= 40);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'company_settings_login_headline_length'
  ) then
    alter table public.company_settings
      add constraint company_settings_login_headline_length
      check (char_length(login_headline) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'company_settings_login_accounts_title_length'
  ) then
    alter table public.company_settings
      add constraint company_settings_login_accounts_title_length
      check (char_length(login_accounts_title) <= 60);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'company_settings_login_footer_length'
  ) then
    alter table public.company_settings
      add constraint company_settings_login_footer_length
      check (char_length(login_footer_label) <= 60);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'company_settings_login_feature_labels_length'
  ) then
    alter table public.company_settings
      add constraint company_settings_login_feature_labels_length
      check (
        char_length(login_feature_one_label) <= 24
        and char_length(login_feature_two_label) <= 24
        and char_length(login_feature_three_label) <= 24
      );
  end if;
end $$;

update public.company_settings
set login_footer_label = coalesce(nullif(trim(login_footer_label), ''), name)
where id = 'company_profile';

grant select (
  id,
  name,
  logo_url,
  updated_at,
  login_kicker,
  login_badge_label,
  login_headline,
  login_accounts_title,
  login_footer_label,
  login_feature_one_label,
  login_feature_two_label,
  login_feature_three_label
) on public.company_settings to anon;
