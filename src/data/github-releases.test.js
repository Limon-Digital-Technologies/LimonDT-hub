import test from "node:test";
import assert from "node:assert/strict";
import { downloadVerifiedMsi, parseSha256Checksum, resolveLatestReleaseTag } from "./github-releases.js";

const app = {
  id: "calculator",
  repository: "Limon-Digital-Technologies/LimonDT-Calculator",
  assetName: "Limon-Calculator-windows-x64.msi",
  checksumName: "Limon-Calculator-windows-x64.msi.sha256",
};
const installerBytes = Uint8Array.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2, 3,
]);

function response(body, { status = 200, contentLength } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name === "content-length" ? contentLength ?? null : null },
    async json() { return body; },
    async text() { return body; },
    async arrayBuffer() {
      return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    },
  };
}

test("resolves the latest stable version from the GitHub release tag", async () => {
  const fetchResource = async () => response({
    tag_name: "v1.1.0",
    draft: false,
    prerelease: false,
  });

  assert.equal(await resolveLatestReleaseTag({ ...app, name: "Calculator", version: "1.0.1" }, fetchResource), "1.1.0");
});

test("reports latest-version lookup failures rather than silently using the catalog version", async () => {
  const fetchResource = async () => response({}, { status: 503 });

  await assert.rejects(
    resolveLatestReleaseTag({ ...app, name: "Calculator", version: "1.0.1" }, fetchResource),
    /HTTP 503/,
  );
});

test("downloads the selected MSI and checksum from the latest stable release", async () => {
  const checksum = await crypto.subtle.digest("SHA-256", installerBytes);
  const hash = [...new Uint8Array(checksum)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const requests = [];
  const fetchResource = async (url, options) => {
    requests.push({ url, options });
    if (url.includes("api.github.com")) {
      return response({
        tag_name: "v1.0.2",
        draft: false,
        prerelease: false,
        assets: [
          {
            name: app.assetName,
            state: "uploaded",
            browser_download_url: "https://github.com/Limon-Digital-Technologies/LimonDT-Calculator/releases/download/v1.0.2/Limon-Calculator-windows-x64.msi",
          },
          {
            name: app.checksumName,
            state: "uploaded",
            browser_download_url: "https://github.com/Limon-Digital-Technologies/LimonDT-Calculator/releases/download/v1.0.2/Limon-Calculator-windows-x64.msi.sha256",
          },
        ],
      });
    }
    if (url.endsWith(app.assetName)) return response(installerBytes);
    if (url.endsWith(app.checksumName)) return response(`${hash}  ${app.assetName}\n`);
    throw new Error(`Unexpected request: ${url}`);
  };

  let releaseFound;
  const result = await downloadVerifiedMsi(app, fetchResource, (tag) => {
    releaseFound = tag;
  });

  assert.equal(result.releaseTag, "v1.0.2");
  assert.equal(releaseFound, "v1.0.2");
  assert.deepEqual(result.installerBytes, installerBytes);
  assert.match(requests[0].url, /api\.github\.com\/repos\/Limon-Digital-Technologies\/LimonDT-Calculator\/releases\/latest$/);
  assert.equal(requests[0].options.headers.Accept, "application/vnd.github+json");
  assert.equal(requests.length, 3);
});

test("verifies an MSI against the GitHub release digest when no checksum asset is configured", async () => {
  const checksum = await crypto.subtle.digest("SHA-256", installerBytes);
  const hash = [...new Uint8Array(checksum)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const notes = {
    ...app,
    id: "notes",
    repository: "Limon-Digital-Technologies/limonDT-notes",
    assetName: "Limon.Notes_1.0.0_x64_en-US.msi",
    checksumName: null,
  };
  const requests = [];
  const fetchResource = async (url) => {
    requests.push(url);
    if (url.includes("api.github.com")) {
      return response({
        tag_name: "v1.0.0",
        draft: false,
        prerelease: false,
        assets: [{
          name: notes.assetName,
          state: "uploaded",
          browser_download_url: "https://github.com/Limon-Digital-Technologies/limonDT-notes/releases/download/v1.0.0/Limon.Notes_1.0.0_x64_en-US.msi",
          digest: `sha256:${hash}`,
        }],
      });
    }
    return response(installerBytes);
  };

  const result = await downloadVerifiedMsi(notes, fetchResource);
  assert.equal(result.releaseTag, "v1.0.0");
  assert.deepEqual(result.installerBytes, installerBytes);
  assert.equal(requests.length, 2);
});

test("rejects checksum files naming a different installer", () => {
  assert.throws(
    () => parseSha256Checksum(`${"a".repeat(64)}  other.msi`, app.assetName),
    /корректная SHA-256/,
  );
});

test("rejects a release asset URL outside the configured GitHub repository", async () => {
  const fetchResource = async () => response({
    tag_name: "v1.0.2",
    draft: false,
    prerelease: false,
    assets: [
      {
        name: app.assetName,
        state: "uploaded",
        browser_download_url: "https://example.com/installer.msi",
      },
    ],
  });

  await assert.rejects(downloadVerifiedMsi(app, fetchResource), /вне репозитория приложения/);
});

test("rejects incomplete or prerelease-only release metadata", async () => {
  const fetchResource = async () => response({
    tag_name: "v1.0.2-beta",
    prerelease: true,
    assets: [],
  });

  await assert.rejects(downloadVerifiedMsi(app, fetchResource), /некорректный или нестабильный релиз/);
});

test("allows a missing content-length and enforces the MSI signature", async () => {
  const fetchResource = async (url) => {
    if (url.includes("api.github.com")) {
      return response({
        tag_name: "v1.0.2",
        assets: [
          {
            name: app.assetName,
            state: "uploaded",
            browser_download_url: "https://github.com/Limon-Digital-Technologies/LimonDT-Calculator/releases/download/v1.0.2/Limon-Calculator-windows-x64.msi",
          },
          {
            name: app.checksumName,
            state: "uploaded",
            browser_download_url: "https://github.com/Limon-Digital-Technologies/LimonDT-Calculator/releases/download/v1.0.2/Limon-Calculator-windows-x64.msi.sha256",
          },
        ],
      });
    }
    if (url.endsWith(app.assetName)) return response(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    return response("0".repeat(64));
  };

  await assert.rejects(downloadVerifiedMsi(app, fetchResource), /не является Windows MSI/);
});
