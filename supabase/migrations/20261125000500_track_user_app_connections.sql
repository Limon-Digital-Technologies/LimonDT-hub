alter table public.app_catalog
  alter column checksum_name drop not null;

insert into public.app_catalog (
  id, name, category, description, icon_text, color, repository,
  asset_name, checksum_name, version, sort_order, is_published
) values (
  'notes',
  'Limon Notes',
  'Продуктивность',
  'Заметки, списки и упоминания приложений экосистемы Limon.',
  'LN',
  'purple',
  'Limon-Digital-Technologies/limonDT-notes',
  'Limon.Notes_1.0.1_x64_en-US.msi',
  null,
  '1.0.1',
  20,
  false
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
  is_published = false,
  updated_at = now();

create table if not exists public.user_app_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null references public.app_catalog(id) on delete cascade,
  connected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, app_id)
);

alter table public.user_app_connections enable row level security;

drop policy if exists "Users can read their app connections" on public.user_app_connections;
create policy "Users can read their app connections"
  on public.user_app_connections
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can connect apps to their account" on public.user_app_connections;
create policy "Users can connect apps to their account"
  on public.user_app_connections
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their app connections" on public.user_app_connections;
create policy "Users can update their app connections"
  on public.user_app_connections
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.user_app_connections to authenticated;

drop policy if exists "Authenticated users can read connected app details" on public.app_catalog;
create policy "Authenticated users can read connected app details"
  on public.app_catalog
  for select
  to authenticated
  using (
    is_published
    or exists (
      select 1
      from public.user_app_connections as connection
      where connection.user_id = auth.uid()
        and connection.app_id = app_catalog.id
    )
  );
