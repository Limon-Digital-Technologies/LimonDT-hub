import test from "node:test";
import assert from "node:assert/strict";
import { readReleaseVersionCache, writeReleaseVersionCache } from "./release-version-cache.js";

test("reads valid cached release versions and ignores malformed entries", () => {
  const storage = {
    getItem: () => JSON.stringify({
      calculator: "1.1.0",
      notes: "1.0.1",
      "bad id": "1.0.0",
      unknown: "not-a-version",
    }),
  };

  assert.deepEqual(readReleaseVersionCache(storage), {
    calculator: "1.1.0",
    notes: "1.0.1",
  });
});

test("writes release versions for the next startup", () => {
  let saved;
  const storage = {
    setItem(key, value) {
      saved = [key, value];
    },
  };

  writeReleaseVersionCache(storage, { calculator: "1.1.0" });

  assert.deepEqual(saved, ["limon-hub-release-versions", '{"calculator":"1.1.0"}']);
});
