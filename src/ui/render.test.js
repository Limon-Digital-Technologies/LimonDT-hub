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
