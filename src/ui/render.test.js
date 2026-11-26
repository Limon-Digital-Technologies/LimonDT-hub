import test from "node:test";
import assert from "node:assert/strict";
import { renderApp } from "./render.js";

const calculator = {
  id: "calculator",
  name: "Limon Calculator",
  category: "Утилиты",
  description: "Отдельное Windows-приложение.",
  icon: "LC",
  color: "blue",
  version: "1.0.1",
};

const baseProps = {
  activePage: "apps",
  apps: [calculator],
  user: { name: "Test User", email: "test@example.com", initials: "TU" },
  version: "0.2.0",
};

test("catalog offers installation without embedding the calculator", () => {
  const html = renderApp(baseProps);

  assert.match(html, /data-app-action="calculator" data-action="install"/);
  assert.match(html, /Установить<\/button>/);
  assert.doesNotMatch(html, /data-calculator-action|calculator-keys/);
});

test("library offers launch and uninstall only for installed apps", () => {
  const html = renderApp({
    ...baseProps,
    activePage: "library",
    installedApps: new Set(["calculator"]),
  });

  assert.match(html, /data-app-action="calculator" data-action="launch"/);
  assert.match(html, /data-remove-app="calculator"/);
  assert.match(html, /Запустить<\/button>/);
  assert.match(html, /Удалить<\/button>/);
});

test("empty library does not list catalog apps as installed", () => {
  const html = renderApp({ ...baseProps, activePage: "library" });

  assert.match(html, /В библиотеке пока пусто/);
  assert.doesNotMatch(html, /data-app-action="calculator"/);
});

test("catalog loading and errors are shown instead of a false empty state", () => {
  const loadingHtml = renderApp({ ...baseProps, catalogLoading: true });
  assert.match(loadingHtml, /Загружаем каталог/);

  const errorHtml = renderApp({ ...baseProps, catalogError: "Supabase недоступен" });
  assert.match(errorHtml, /Supabase недоступен/);
  assert.match(errorHtml, /data-catalog-retry/);
});

test("install card shows the current download stage", () => {
  const html = renderApp({
    ...baseProps,
    installingApps: new Set(["calculator"]),
    installStatuses: new Map([["calculator", "Скачиваем установщик…"]]),
  });

  assert.match(html, /Скачиваем установщик…/);
  assert.match(html, /aria-busy="true"/);
});

test("catalog text is rendered as text rather than markup", () => {
  const html = renderApp({
    ...baseProps,
    apps: [{ ...calculator, name: "<img src=x onerror=alert(1)>" }],
  });
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("calculator card uses the supplied Calculator asset", () => {
  const html = renderApp(baseProps);
  assert.match(html, /src="\/assets\/calculator-logo\.png"/);
});

test("settings support English and appearance choices", () => {
  const html = renderApp({
    ...baseProps,
    activePage: "settings",
    language: "en",
    settings: { theme: "dark", appearance: "liquid", animations: true, compact: false },
  });

  assert.match(html, /data-theme="dark"/);
  assert.match(html, /data-appearance="liquid"/);
  assert.match(html, /data-language="en"/);
  assert.match(html, /Limon Hub update/);
});

test("settings expose one-time shared storage setup", () => {
  const html = renderApp({
    ...baseProps,
    activePage: "settings",
    language: "ru",
    settings: { theme: "light", appearance: "standard", animations: true, compact: false },
    storageRoot: null,
  });

  assert.match(html, /data-storage-open/);
  assert.match(html, /Выбрать диск/);
});

test("settings offer Hub relocation when its installation is outside shared storage", () => {
  const html = renderApp({
    ...baseProps,
    activePage: "settings",
    settings: { theme: "light", appearance: "standard", animations: true, compact: false },
    storageRoot: "D:\\LimonDT\\user",
    hubRelocationRequired: true,
  });

  assert.match(html, /Hub ещё установлен в прежнем месте/);
  assert.match(html, /data-storage-action="relocate-hub"/);
  assert.match(html, /Перенести Hub/);
});

test("storage setup modal only offers drive selection", () => {
  const html = renderApp({
    ...baseProps,
    storageDialogOpen: true,
    storageDrives: ["C:", "D:"],
    storageDriveSelection: "D:",
    pendingStorageAppName: "Limon Notes",
  });

  assert.match(html, /id="storage-drive"/);
  assert.match(html, /<option value="D:" selected>D:<\/option>/);
  assert.match(html, /Limon Notes/);
  assert.doesNotMatch(html, /type="text"[^>]+storage/i);
});

test("glass modes use native acrylic and separate Calculator-style surfaces", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const main = await readFile(new URL("../main.js", import.meta.url), "utf8");
  const capability = await readFile(
    new URL("../../src-tauri/capabilities/default.json", import.meta.url),
    "utf8",
  );
  const tauriConfig = await readFile(
    new URL("../../src-tauri/tauri.conf.json", import.meta.url),
    "utf8",
  );
  assert.match(css, /body\.appearance-translucent/);
  assert.match(css, /body\.appearance-liquid-glass/);
  assert.match(css, /native-window-effects/);
  assert.match(css, /backdrop-filter:\s*blur\(30px\)/);
  assert.match(css, /radial-gradient\(/);
  assert.match(main, /Effect\.Acrylic/);
  assert.match(main, /getCurrentWindow\(\)/);
  assert.match(capability, /core:window:allow-set-effects/);
  assert.match(tauriConfig, /"transparent":\s*true/);
});
