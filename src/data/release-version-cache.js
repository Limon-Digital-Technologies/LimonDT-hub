const cacheKey = "limon-hub-release-versions";

export function readReleaseVersionCache(storage) {
  const raw = storage.getItem(cacheKey);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([id, version]) => (
        /^[a-z0-9][a-z0-9-]*$/.test(id)
        && typeof version === "string"
        && /^[0-9][0-9A-Za-z.+-]*$/.test(version)
      )),
    );
  } catch {
    return {};
  }
}

export function writeReleaseVersionCache(storage, versions) {
  storage.setItem(cacheKey, JSON.stringify(versions));
}
