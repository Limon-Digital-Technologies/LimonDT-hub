import test from "node:test";
import assert from "node:assert/strict";
import { errorMessage } from "./error-message.js";

test("formats Error objects and Tauri string rejections", () => {
  assert.equal(errorMessage(new Error("Windows Installer failed")), "Windows Installer failed");
  assert.equal(errorMessage("Установка отменена."), "Установка отменена.");
});

test("uses a useful message for structured and empty errors", () => {
  assert.equal(errorMessage({ error: "GitHub недоступен" }), "GitHub недоступен");
  assert.equal(errorMessage(undefined), "Неизвестная ошибка.");
  assert.equal(errorMessage({}), "Неизвестная ошибка.");
});
