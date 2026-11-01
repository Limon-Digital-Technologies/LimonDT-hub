create table if not exists public.app_catalog (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null check (length(name) between 1 and 100),
  category text not null check (length(category) between 1 and 60),
  description text not null check (length(description) between 1 and 500),
  icon_text text not null check (length(icon_text) between 1 and 8),
  color text not null check (color in ('blue', 'purple', 'orange', 'green')),
  repository text not null check (repository ~ '^Limon-Digital-Technologies/[A-Za-z0-9._-]+$'),
  asset_name text not null check (asset_name ~ '^[A-Za-z0-9._-]+[.]msi$'),
  checksum_name text not null check (checksum_name ~ '^[A-Za-z0-9._-]+[.]msi[.]sha256$'),
  version text not null check (length(version) between 1 and 32),
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_catalog enable row level security;

drop policy if exists "Public can read published app catalog" on public.app_catalog;
create policy "Public can read published app catalog"
  on public.app_catalog
  for select
  to anon, authenticated
  using (is_published);

grant select on public.app_catalog to anon, authenticated;

insert into public.app_catalog (
  id, name, category, description, icon_text, color, repository,
  asset_name, checksum_name, version, sort_order, is_published
) values (
  'calculator',
  'Limon Calculator',
  'Утилиты',
  'Отдельное Windows-приложение для ежедневных вычислений.',
  'LC',
  'blue',
  'Limon-Digital-Technologies/LimonDT-Calculator',
  'Limon-Calculator-windows-x64.msi',
  'Limon-Calculator-windows-x64.msi.sha256',
  '1.0.1',
  10,
  true
)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  icon_text = excluded.icon_text,
  color = excluded.color,
  repository = excluded.repository,
  asset_name = excluded.asset_name,
  checksum_name = excluded.checksum_name,
  version = excluded.version,
  sort_order = excluded.sort_order,
  is_published = excluded.is_published,
  updated_at = now();
