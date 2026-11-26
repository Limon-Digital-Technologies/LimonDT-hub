const maxInstallerBytes = 100 * 1024 * 1024;
const msiHeader = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function assertReleaseAssetUrl(url, repository) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("GitHub вернул некорректную ссылку на файл релиза.");
  }
  const [owner, repo] = repository.split("/");
  if (parsedUrl.protocol !== "https:"
    || parsedUrl.hostname !== "github.com"
    || !parsedUrl.pathname.startsWith(`/${owner}/${repo}/releases/download/`)) {
    throw new Error("GitHub вернул ссылку на файл вне репозитория приложения.");
  }
  return parsedUrl.href;
}

async function findReleaseAssets(app, fetchResource) {
  const [owner, repo] = app.repository.split("/");
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
  const response = await fetchResource(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("В репозитории пока нет опубликованного стабильного релиза.");
    }

    if (response.status === 403 || response.status === 429) {
      throw new Error("GitHub временно ограничил запросы. Попробуйте скачать приложение позже.");
    }
    throw new Error(`Не удалось получить релиз GitHub: HTTP ${response.status}.`);
  }

  let release;
  try {
    release = await response.json();
  } catch {
    throw new Error("GitHub вернул некорректные данные релиза.");
  }
  if (!release || typeof release !== "object"
    || typeof release.tag_name !== "string"
    || !release.tag_name.trim()
    || release.draft === true
    || release.prerelease === true
    || !Array.isArray(release.assets)) {
    throw new Error("GitHub вернул некорректный или нестабильный релиз.");
  }

  const findAsset = (name) => {
    const asset = release.assets.find((entry) => (
      entry?.name === name && entry.state === "uploaded" && typeof entry.browser_download_url === "string"
    ));
    if (!asset) throw new Error(`В релизе ${release.tag_name} не найден файл ${name}.`);
    return {
      url: assertReleaseAssetUrl(asset.browser_download_url, app.repository),
      digest: asset.digest,
    };
  };
  const installer = findAsset(app.assetName);

  return {
    tag: release.tag_name,
    installerUrl: installer.url,
    installerDigest: installer.digest,
    checksumUrl: app.checksumName ? findAsset(app.checksumName).url : null,
  };
}

export async function resolveLatestReleaseTag(app, fetchResource) {
  const [owner, repo] = app.repository.split("/");
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
  const response = await fetchResource(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) return app.version;
  const release = await response.json();
  if (!release || typeof release.tag_name !== "string") return app.version;
  return release.tag_name.replace(/^v/i, "");
}

export function parseSha256Checksum(checksumText, installerName) {
  for (const line of checksumText.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-f\d]{64})(?:\s+[*]?(.+?))?$/i);
    if (!match) continue;
    const fileName = match[2]?.trim();
    if (fileName && fileName !== installerName) continue;
    return match[1].toLowerCase();
  }
  throw new Error("В релизе отсутствует корректная SHA-256 контрольная сумма для установщика.");
}

export async function downloadVerifiedMsi(app, fetchResource, onReleaseFound = () => {}) {
  const release = await findReleaseAssets(app, fetchResource);
  onReleaseFound(release.tag);

  const [installerResponse, checksumResponse] = await Promise.all([
    fetchResource(release.installerUrl),
    release.checksumUrl ? fetchResource(release.checksumUrl) : Promise.resolve(null),
  ]);
  if (!installerResponse.ok) {
    throw new Error(`Не удалось скачать установщик: HTTP ${installerResponse.status}.`);
  }
  if (checksumResponse && !checksumResponse.ok) {
    throw new Error(`Не удалось скачать контрольную сумму: HTTP ${checksumResponse.status}.`);
  }

  const contentLengthHeader = installerResponse.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < msiHeader.length || contentLength > maxInstallerBytes) {
      throw new Error("Размер установщика неизвестен или превышает ограничение 100 МБ.");
    }
  }

  const installerBytes = new Uint8Array(await installerResponse.arrayBuffer());
  if (installerBytes.byteLength < msiHeader.length || installerBytes.byteLength > maxInstallerBytes) {
    throw new Error("Размер установщика некорректен или превышает ограничение 100 МБ.");
  }
  if (!msiHeader.every((byte, index) => installerBytes[index] === byte)) {
    throw new Error("GitHub вернул файл, который не является Windows MSI.");
  }

  const expectedHash = checksumResponse
    ? parseSha256Checksum(await checksumResponse.text(), app.assetName)
    : parseReleaseDigest(release.installerDigest);
  const hashBuffer = await crypto.subtle.digest("SHA-256", installerBytes);
  const actualHash = [...new Uint8Array(hashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (actualHash !== expectedHash) {
    throw new Error("Контрольная сумма установщика не совпадает. Файл не сохранён.");
  }

  return { installerBytes, releaseTag: release.tag };
}

function parseReleaseDigest(digest) {
  const match = typeof digest === "string" && digest.match(/^sha256:([a-f\d]{64})$/i);
  if (!match) {
    throw new Error("В метаданных релиза GitHub отсутствует корректная SHA-256 контрольная сумма.");
  }
  return match[1].toLowerCase();
}
