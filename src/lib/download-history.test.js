import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDownloadHistory, upsertDownloadHistory } from "./download-history.js";

test("download history keeps only the latest entry for one application", () => {
  const normalized = normalizeDownloadHistory([
    { id: "calculator", fileName: "old.msi", downloadedAt: "2026-01-01" },
    { id: "calculator", fileName: "new.msi", downloadedAt: "2026-11-20", version: "1.1.0" },
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].fileName, "new.msi");
  assert.equal(normalized[0].version, "1.1.0");
});

test("upsert replaces an existing app download instead of adding duplicates", () => {
  const result = upsertDownloadHistory(
    [{ id: "calculator", fileName: "old.msi", downloadedAt: "2026-01-01" }],
    { id: "calculator", fileName: "new.msi", downloadedAt: "2026-11-20", version: "1.1.0" },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].fileName, "new.msi");
});
