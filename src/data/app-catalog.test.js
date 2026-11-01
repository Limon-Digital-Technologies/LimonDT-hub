import test from "node:test";
import assert from "node:assert/strict";
import { fetchAppCatalog, mapCatalogRow } from "./app-catalog.js";

const row = {
  id: "calculator",
  name: "Limon Calculator",
  category: "Утилиты",
  description: "Отдельное Windows-приложение.",
  icon_text: "LC",
  color: "blue",
  repository: "Limon-Digital-Technologies/LimonDT-Calculator",
  asset_name: "Limon-Calculator-windows-x64.msi",
  checksum_name: "Limon-Calculator-windows-x64.msi.sha256",
  version: "1.0.1",
  sort_order: 10,
};

test("maps a published row to a GitHub release app entry", () => {
  assert.deepEqual(mapCatalogRow(row), {
    id: "calculator",
    name: "Limon Calculator",
    category: "Утилиты",
    description: "Отдельное Windows-приложение.",
    icon: "LC",
    color: "blue",
    repository: "Limon-Digital-Technologies/LimonDT-Calculator",
    assetName: "Limon-Calculator-windows-x64.msi",
    checksumName: "Limon-Calculator-windows-x64.msi.sha256",
    fileName: "Limon-Calculator-windows-x64.msi",
    version: "1.0.1",
    sortOrder: 10,
  });
});

test("rejects catalog entries that point outside Limon GitHub repositories", () => {
  assert.throws(
    () => mapCatalogRow({ ...row, repository: "someone-else/malicious-app" }),
    /не принадлежит организации Limon/,
  );
});

test("loads published catalog entries and reports Supabase errors", async () => {
  const calls = [];
  const client = {
    from(table) {
      calls.push(["from", table]);
      return {
        select(columns) {
          calls.push(["select", columns]);
          return this;
        },
        eq(column, value) {
          calls.push(["eq", column, value]);
          return this;
        },
        order(column) {
          calls.push(["order", column]);
          return this;
        },
        then(resolve) {
          resolve({ data: [row], error: null });
        },
      };
    },
  };
  const entries = await fetchAppCatalog(client);
  assert.equal(entries.length, 1);
  assert.deepEqual(calls.slice(0, 3), [
    ["from", "app_catalog"],
    ["select", "id,name,category,description,icon_text,color,repository,asset_name,checksum_name,version,sort_order"],
    ["eq", "is_published", true],
  ]);

  const failingClient = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        then(resolve) { resolve({ data: null, error: { message: "table missing" } }); },
      };
    },
  };
  await assert.rejects(fetchAppCatalog(failingClient), /table missing/);
});
