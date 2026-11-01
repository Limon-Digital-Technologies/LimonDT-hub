const allowedColors = new Set(["blue", "purple", "orange", "green"]);
const organization = "Limon-Digital-Technologies";

function requiredText(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`В каталоге некорректно заполнено поле ${field}.`);
  }
  return value.trim();
}

export function mapCatalogRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Supabase вернул некорректную запись приложения.");
  }
  const id = requiredText(row.id, "id", 64);
  const repository = requiredText(row.repository, "repository", 200);
  const assetName = requiredText(row.asset_name, "asset_name", 200);
  const checksumName = requiredText(row.checksum_name, "checksum_name", 220);
  const color = requiredText(row.color, "color", 16);

  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error("В каталоге некорректный id приложения.");
  if (!new RegExp(`^${organization}/[A-Za-z0-9._-]+$`).test(repository)) {
    throw new Error(`Репозиторий ${repository} не принадлежит организации Limon.`);
  }
  if (!/^[A-Za-z0-9._-]+\.msi$/i.test(assetName)
    || !/^[A-Za-z0-9._-]+\.msi\.sha256$/i.test(checksumName)) {
    throw new Error(`Для ${id} указаны некорректные имена MSI или SHA-256 файла.`);
  }
  if (!allowedColors.has(color)) throw new Error(`Для ${id} указан неподдерживаемый цвет.`);

  return {
    id,
    name: requiredText(row.name, "name", 100),
    category: requiredText(row.category, "category", 60),
    description: requiredText(row.description, "description", 500),
    icon: requiredText(row.icon_text, "icon_text", 8),
    color,
    repository,
    assetName,
    checksumName,
    fileName: assetName,
    version: requiredText(row.version, "version", 32),
    sortOrder: Number.isInteger(row.sort_order) ? row.sort_order : 0,
  };
}

export async function fetchAppCatalog(client) {
  const { data, error } = await client
    .from("app_catalog")
    .select("id,name,category,description,icon_text,color,repository,asset_name,checksum_name,version,sort_order")
    .eq("is_published", true)
    .order("sort_order")
    .order("name");

  if (error) throw new Error(`Не удалось загрузить каталог Supabase: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("Supabase вернул каталог в неизвестном формате.");
  return data.map(mapCatalogRow);
}
