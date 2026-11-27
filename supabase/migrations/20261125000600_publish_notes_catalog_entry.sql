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
  is_published = true,
    updated_at = now()
where public.app_catalog.repository = excluded.repository;
