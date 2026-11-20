export function normalizeDownloadHistory(downloads) {
  if (!Array.isArray(downloads)) return [];
  const latestById = new Map();
  for (const download of downloads) {
    if (!download || typeof download !== "object" || typeof download.id !== "string") continue;
    latestById.set(download.id, {
      id: download.id,
      fileName: typeof download.fileName === "string" ? download.fileName : "",
      downloadedAt: typeof download.downloadedAt === "string" ? download.downloadedAt : "",
      version: typeof download.version === "string" ? download.version : undefined,
    });
  }
  return [...latestById.values()];
}

export function upsertDownloadHistory(downloads, download) {
  if (!download || typeof download.id !== "string") return normalizeDownloadHistory(downloads);
  const normalized = normalizeDownloadHistory(downloads).filter((item) => item.id !== download.id);
  normalized.push(download);
  return normalized;
}
