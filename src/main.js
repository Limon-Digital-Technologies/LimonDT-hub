import "./styles.css";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import { BaseDirectory, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import packageJson from "../package.json";
import { fetchAppCatalog } from "./data/app-catalog.js";
import { downloadVerifiedMsi, resolveLatestReleaseTag } from "./data/github-releases.js";
import { readReleaseVersionCache, writeReleaseVersionCache } from "./data/release-version-cache.js";
import { errorMessage } from "./lib/error-message.js";
import { normalizeLanguage } from "./lib/i18n.js";
import { normalizeDownloadHistory, upsertDownloadHistory } from "./lib/download-history.js";
import { supabase, supabaseConfigError } from "./lib/supabase.js";
import { renderApp, renderAuth } from "./ui/render.js";

const root = document.querySelector("#app");
const nativeWindow = isTauri() ? getCurrentWindow() : null;
const updaterEnabled = import.meta.env.VITE_UPDATER_ENABLED === "true";
const hubInstaller = {
  id: "hub",
  repository: "Limon-Digital-Technologies/LimonDT-hub",
  assetName: "Limon-Hub-windows-x64.msi",
  checksumName: "Limon-Hub-windows-x64.msi.sha256",
  fileName: "Limon-Hub-windows-x64.msi",
};
const legacyStorageKey = "limon-hub-preferences";
const pendingInstallStorageKey = "limon-hub-pending-install";
const defaultSettings = {
  animations: true,
  compact: false,
  theme: "light",
  appearance: "standard",
  language: "ru",
};
const state = {
  activePage: "home",
  query: "",
  apps: [],
  catalogLoading: false,
  catalogError: null,
  releaseVersionErrors: new Set(),
  installedApps: new Set(),
  installedVersions: new Map(),
  installingApps: new Set(),
  installStatuses: new Map(),
  uninstallingApps: new Set(),
  downloads: [],
  settings: { ...defaultSettings },
  user: null,
  authLoading: true,
  authPending: false,
  authMode: "sign-in",
  authMessage: null,
  updaterStatus: updaterEnabled
    ? "Автоматическая проверка обновлений при запуске."
    : "Автообновления будут включены после настройки публикации.",
  updaterChecking: false,
  updateInstalling: false,
  availableUpdate: null,
  storageRoot: null,
  storageDrives: [],
  storageDriveSelection: "",
  storageDialogOpen: false,
  pendingStorageAppId: null,
  storageError: null,
  storageLoaded: false,
  storageNeedsRestart: false,
  hubRelocationRequired: false,
  hubRelocationPending: false,
};
let nativeAppearanceRequest = "";
let nativeAppearanceRevision = 0;
let nativeAppearanceTask = Promise.resolve();
let storageInfoPromise = null;
let startupFinishPromise = null;

function preferencesKey(userId) {
  return `limon-hub-preferences:${userId}`;
}

function loadPreferences(userId) {
  const key = preferencesKey(userId);
  let stored = localStorage.getItem(key);
  if (stored === null) {
    stored = localStorage.getItem(legacyStorageKey);
    if (stored !== null) localStorage.setItem(key, stored);
  }
  let preferences = {};
  try {
    preferences = stored ? JSON.parse(stored) : {};
  } catch {
    preferences = {};
  }
  state.downloads = normalizeDownloadHistory(preferences.downloads);
  state.settings = {
    animations: preferences.settings?.animations ?? defaultSettings.animations,
    compact: preferences.settings?.compact ?? defaultSettings.compact,
    theme: preferences.settings?.theme === "dark" ? "dark" : "light",
    appearance: ["translucent", "liquid"].includes(preferences.settings?.appearance)
      ? preferences.settings.appearance
      : "standard",
    language: normalizeLanguage(preferences.settings?.language),
  };
  applyAppearancePreferences();
}

function applyAppearancePreferences() {
  document.body.classList.toggle("theme-dark", state.settings.theme === "dark");
  document.body.classList.toggle("appearance-translucent", state.settings.appearance === "translucent");
  document.body.classList.toggle("appearance-liquid-glass", state.settings.appearance === "liquid");
  document.body.classList.toggle("no-motion", !state.settings.animations);
  document.body.classList.toggle("is-compact", state.settings.compact);
  document.documentElement.lang = state.settings.language;
  syncNativeWindowAppearance();
}

function persistPreferences() {
  if (!state.user) {
    localStorage.setItem(
      legacyStorageKey,
      JSON.stringify({ downloads: state.downloads, settings: state.settings }),
    );
    return;
  }

  localStorage.setItem(
    preferencesKey(state.user.id),
    JSON.stringify({
      downloads: state.downloads,
      settings: state.settings,
    }),
  );
}

function syncNativeWindowAppearance() {
  if (!nativeWindow) return;
  const appearance = state.settings.appearance;
  if (appearance === nativeAppearanceRequest) return;
  nativeAppearanceRequest = appearance;
  const revision = ++nativeAppearanceRevision;
  const userAgent = navigator.userAgent.toLowerCase();
  let effects = null;

  if (appearance !== "standard") {
    if (userAgent.includes("windows")) {
      effects = { effects: [Effect.Acrylic] };
    } else if (userAgent.includes("macintosh")) {
      effects = appearance === "liquid"
        ? { effects: [Effect.LiquidGlassRegular, Effect.Popover] }
        : { effects: [Effect.Popover] };
    }
  }

  nativeAppearanceTask = nativeAppearanceTask.then(async () => {
    if (revision !== nativeAppearanceRevision) return;
    try {
      if (effects) {
        await nativeWindow.setEffects(effects);
      } else {
        await nativeWindow.clearEffects();
      }
      if (revision !== nativeAppearanceRevision) return;
      const hasNativeEffects = Boolean(effects);
      document.documentElement.classList.toggle("native-window-effects", hasNativeEffects);
      document.body.classList.toggle("native-window-effects", hasNativeEffects);
    } catch (error) {
      if (revision !== nativeAppearanceRevision) return;
      nativeAppearanceRequest = "";
      document.documentElement.classList.remove("native-window-effects");
      document.body.classList.remove("native-window-effects");
      console.error("Could not apply native window material", error);
      showToast(state.settings.language === "en"
        ? "Could not apply the system window effect."
        : "Не удалось применить системный эффект окна.");
    }
  });
}

function finishStartup() {
  if (startupFinishPromise) return startupFinishPromise;
  startupFinishPromise = (async () => {
    await nativeAppearanceTask;
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    document.documentElement.classList.add("app-ready");
    const startupScreen = document.querySelector("#startup-screen");
    if (!startupScreen) return;
    startupScreen.classList.add("is-leaving");
    window.setTimeout(() => startupScreen.remove(), 260);
  })();
  return startupFinishPromise;
}

function loadUnauthenticatedPreferences() {
  try {
    const preferences = JSON.parse(localStorage.getItem(legacyStorageKey) || "{}");
    state.settings = {
      animations: preferences.settings?.animations ?? defaultSettings.animations,
      compact: preferences.settings?.compact ?? defaultSettings.compact,
      theme: preferences.settings?.theme === "dark" ? "dark" : "light",
      appearance: ["translucent", "liquid"].includes(preferences.settings?.appearance)
        ? preferences.settings.appearance
        : "standard",
      language: normalizeLanguage(preferences.settings?.language),
    };
  } catch {
    state.settings = { ...defaultSettings };
  }
  applyAppearancePreferences();
}

function userProfile(user) {
  const email = user.email || "";
  const name = user.user_metadata?.full_name?.trim()
    || user.user_metadata?.name?.trim()
    || email.split("@")[0]
    || "Limon Hub";
  const initials = name.split(/\s+/).slice(0, 2).map((part) => [...part][0]).join("").toLocaleUpperCase("ru-RU");
  return { id: user.id, name, email, initials };
}

function render({ keepScroll = false } = {}) {
  if (!state.user) {
    root.innerHTML = state.authLoading
      ? '<main class="auth-loading" aria-label="Загрузка аккаунта"><img src="/assets/HubLogo.png" alt="" /><span class="auth-loading__spinner"></span><p>Проверяем аккаунт…</p></main>'
      : renderAuth({
          mode: state.authMode,
          pending: state.authPending,
          message: state.authMessage,
          configError: supabaseConfigError,
          language: state.settings.language,
        });
    document.body.classList.remove("no-motion", "is-compact");
    applyAppearancePreferences();
    return;
  }

  const scrollTop = root.querySelector(".workspace-scroll")?.scrollTop ?? 0;
  root.innerHTML = renderApp({
    ...state,
    catalogError: state.catalogError?.message ?? null,
    installStatuses: state.installStatuses,
    user: state.user,
    updateAvailableVersion: state.availableUpdate?.version ?? null,
    version: packageJson.version,
    language: state.settings.language,
    pendingStorageAppName: state.apps.find((app) => app.id === state.pendingStorageAppId)?.name ?? "",
    hubRelocationRequired: state.hubRelocationRequired,
    hubRelocationPending: state.hubRelocationPending,
  });
  if (keepScroll) root.querySelector(".workspace-scroll").scrollTop = scrollTop;
  applyAppearancePreferences();
  root.querySelectorAll(".switch").forEach((button) => {
    const value = state.settings[button.dataset.setting];
    button.classList.toggle("is-on", value);
    button.setAttribute("aria-checked", String(value));
  });
}

function loadStorageInfo() {
  if (storageInfoPromise) return storageInfoPromise;
  storageInfoPromise = (async () => {
  if (!isTauri()) {
    state.storageLoaded = true;
    return;
  }
  try {
    const storageInfo = await invoke("get_storage_info");
    state.storageRoot = storageInfo.root;
    state.storageDrives = Array.isArray(storageInfo.drives) ? storageInfo.drives : [];
    state.storageError = storageInfo.migrationError || null;
    state.hubRelocationRequired = storageInfo.hubRelocationRequired === true;
    state.storageDriveSelection = state.storageDrives[0] || "";
    if (state.storageError) {
      console.error("[Limon Hub] Shared storage migration failed:", state.storageError);
    }
  } catch (error) {
    state.storageError = errorMessage(error);
    console.error("[Limon Hub] Could not load shared storage settings:", error);
  } finally {
    state.storageLoaded = true;
    render();
    if (state.storageError && state.user) {
      showToast(`Ошибка общего хранилища: ${state.storageError}`);
    }
  }
  })();
  return storageInfoPromise;
}

async function resumePendingInstall() {
  const appId = localStorage.getItem(pendingInstallStorageKey);
  if (!appId) return;
  if (!["calculator", "notes"].includes(appId)) {
    localStorage.removeItem(pendingInstallStorageKey);
    console.error("[Limon Hub] Discarded an unknown pending app installation:", appId);
    return;
  }

  await loadStorageInfo();
  if (state.storageError || !state.storageRoot) return;
  const app = state.apps.find((item) => item.id === appId);
  if (!app) return;

  localStorage.removeItem(pendingInstallStorageKey);
  state.activePage = "apps";
  render();
  void installApp(app);
}

function openStorageSetup(app = null) {
  state.pendingStorageAppId = app?.id ?? null;
  state.storageDriveSelection ||= state.storageDrives[0] || "";
  state.storageDialogOpen = true;
  render();
}

function showToast(message) {
  const region = root.querySelector(".toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  region.replaceChildren(toast);
  window.setTimeout(() => toast.classList.add("toast--leaving"), 2400);
  window.setTimeout(() => {
    if (toast.parentElement === region) region.replaceChildren();
  }, 2800);
}

function fetchAppResource(url, options) {
  return isTauri() ? tauriFetch(url, options) : fetch(url, options);
}

async function relocateHubInstallation() {
  if (!state.hubRelocationRequired || state.hubRelocationPending) return;
  state.hubRelocationPending = true;
  render();
  try {
    const { installerBytes } = await downloadVerifiedMsi(hubInstaller, fetchAppResource);
    await mkdir("installers", { baseDir: BaseDirectory.AppCache, recursive: true });
    await writeFile(`installers/${hubInstaller.fileName}`, installerBytes, {
      baseDir: BaseDirectory.AppCache,
    });
    const scheduled = await invoke("relocate_hub_to_storage", {
      fileName: hubInstaller.fileName,
    });
    state.hubRelocationRequired = false;
    state.hubRelocationPending = false;
    render();
    if (scheduled) {
      showToast("Установщик переносит Hub в общую папку. Приложение перезапустится автоматически.");
    } else {
      await relaunch();
    }
  } catch (error) {
    state.hubRelocationPending = false;
    state.hubRelocationRequired = true;
    console.error("[Limon Hub] Could not relocate Hub installation:", error);
    render();
    showToast(`Не удалось перенести Hub: ${errorMessage(error)}. Повторите попытку в настройках.`);
  }
}

async function loadAppCatalog() {
  state.catalogLoading = true;
  state.catalogError = null;
  state.releaseVersionErrors = new Set();
  render();
  let catalog;
  let cachedVersions = {};
  try {
    catalog = await fetchAppCatalog(supabase);
    try {
      cachedVersions = readReleaseVersionCache(localStorage);
    } catch (error) {
      console.warn("[Limon Hub] Could not read cached application versions:", error);
    }
    state.apps = catalog.map((app) => ({
      ...app,
      version: cachedVersions[app.id] || app.version,
    }));
  } catch (error) {
    state.catalogError = error;
    state.apps = [];
  } finally {
    state.catalogLoading = false;
    render();
  }
  if (!catalog) return;

  void refreshLatestVersions(state.apps, cachedVersions);
}

async function refreshLatestVersions(currentCatalog, cachedVersions) {
  const latestVersions = await Promise.allSettled(
    currentCatalog.map(async (app) => ({
      id: app.id,
      version: await resolveLatestReleaseTag(app, fetchAppResource),
    })),
  );
  if (state.apps !== currentCatalog) return;

  for (const [index, result] of latestVersions.entries()) {
    if (result.status === "fulfilled") {
      const { id, version } = result.value;
      currentCatalog[index].version = version;
      delete currentCatalog[index].versionError;
      cachedVersions[id] = version;
    } else {
      const app = currentCatalog[index];
      app.versionError = errorMessage(result.reason);
      state.releaseVersionErrors.add(app.id);
      console.warn(`[Limon Hub] Could not check the latest release for ${app.id}:`, result.reason);
    }
  }
  try {
    writeReleaseVersionCache(localStorage, cachedVersions);
  } catch (error) {
    console.warn("[Limon Hub] Could not save cached application versions:", error);
  }
  render();
}

async function refreshInstalledApps() {
  if (!isTauri()) {
    state.installedApps = new Set();
    state.installedVersions = new Map();
    return;
  }
  const installedEntries = await invoke("get_installed_apps");
  const knownApps = new Set(["calculator", "notes"]);
  const installedVersions = new Map(
    installedEntries
      .filter((entry) => typeof entry === "object" && entry && typeof entry.version === "string")
      .map((entry) => [entry.id, entry.version]),
  );
  state.installedApps = new Set(installedEntries
    .map((entry) => typeof entry === "string" ? entry : entry?.id)
    .filter((id) => knownApps.has(id)));
  state.installedVersions = new Map(
    [...state.installedApps].map((id) => [
      id,
      installedVersions.get(id) || state.downloads.find((download) => download.id === id)?.version || null,
    ]),
  );
}

async function waitForInstalledApp(appId, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await refreshInstalledApps();
    if (state.installedApps.has(appId)) return true;
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }
  return false;
}

async function checkForUpdates({ automatic = false } = {}) {
  if (!isTauri()) {
    state.updaterStatus = "Проверка обновлений доступна в установленном хабе.";
    if (!automatic) render();
    return;
  }
  if (!updaterEnabled) {
    state.updaterStatus = "Автообновления ещё не настроены для этой сборки.";
    if (!automatic) render();
    return;
  }
  if (state.updaterChecking || state.updateInstalling) return;

  state.updaterChecking = true;
  state.updaterStatus = "Проверяем наличие обновлений…";
  if (!automatic) render();

  try {
    state.availableUpdate = await check();
    state.updaterStatus = state.availableUpdate
      ? `Доступна версия ${state.availableUpdate.version}.`
      : `Установлена последняя версия (${packageJson.version}).`;
  } catch (error) {
    state.updaterStatus = `Не удалось проверить обновления: ${errorMessage(error)}`;
    if (!automatic) showToast("Не удалось проверить обновления Limon Hub.");
  } finally {
    state.updaterChecking = false;
    render();
  }
}

async function installHubUpdate() {
  const update = state.availableUpdate;
  if (!update || state.updateInstalling) return;

  state.updateInstalling = true;
  state.updaterStatus = `Загружаем обновление ${update.version}…`;
  render();
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Finished") {
        state.updaterStatus = "Обновление установлено. Перезапускаем хаб…";
        render();
      }
    });
    await relaunch();
  } catch (error) {
    state.updateInstalling = false;
    state.updaterStatus = `Не удалось установить обновление: ${errorMessage(error)}`;
    render();
    showToast("Не удалось установить обновление Limon Hub.");
  }
}

async function installApp(app) {
  if (isTauri()) {
    if (!state.storageLoaded) await loadStorageInfo();
    if (state.storageError) {
      showToast(`Сначала устраните ошибку общего хранилища: ${state.storageError}`);
      return;
    }
    if (state.storageNeedsRestart) {
      showToast("Перезапустите Hub, чтобы применить новое хранилище.");
      return;
    }
    if (!state.storageRoot) {
      openStorageSetup(app);
      return;
    }
  }
  if (state.installingApps.has(app.id)) return;
  state.installingApps.add(app.id);
  state.installStatuses.set(app.id, "Подключаемся к GitHub…");
  render({ keepScroll: true });

  let notification;
  let operation = "скачать";
  try {
    state.installStatuses.set(app.id, "Ищем последний стабильный релиз…");
    render({ keepScroll: true });
    const { installerBytes, releaseTag } = await downloadVerifiedMsi(app, fetchAppResource, (releaseTag) => {
      state.installStatuses.set(app.id, `Скачиваем установщик из релиза ${releaseTag}…`);
      render({ keepScroll: true });
    });
    const normalizedReleaseVersion = releaseTag.replace(/^v/i, "");
    app.version = normalizedReleaseVersion;
    render({ keepScroll: true });
    state.installStatuses.set(app.id, "Проверяем файл и контрольную сумму…");
    render({ keepScroll: true });

    if (isTauri()) {
      operation = "установить";
      state.installStatuses.set(app.id, "Запускаем установщик Windows…");
      render({ keepScroll: true });
      const installerDirectory = "installers";
      await mkdir(installerDirectory, { baseDir: BaseDirectory.AppCache, recursive: true });
      await writeFile(`${installerDirectory}/${app.fileName}`, installerBytes, {
        baseDir: BaseDirectory.AppCache,
      });
      state.installStatuses.set(app.id, `Устанавливаем ${app.name}…`);
      render({ keepScroll: true });
      await invoke("install_app", { appId: app.id, fileName: app.fileName });
      state.installStatuses.set(app.id, "Проверяем установленное приложение…");
      render({ keepScroll: true });
      const installed = await waitForInstalledApp(app.id);
      if (!installed) {
        throw new Error("Установщик запущен. Завершите установку в окне Windows, затем проверьте библиотеку.");
      }
    } else {
      const url = URL.createObjectURL(new Blob([installerBytes], { type: "application/octet-stream" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = app.fileName;
      link.style.position = "absolute";
      link.style.left = "-10000px";
      link.setAttribute("aria-hidden", "true");
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    state.downloads = upsertDownloadHistory(state.downloads, {
      id: app.id,
      fileName: app.fileName,
      downloadedAt: new Date().toISOString(),
      version: normalizedReleaseVersion,
    });
    if (state.installedApps.has(app.id)) {
      state.installedVersions.set(app.id, normalizedReleaseVersion);
    }
    if (isTauri()) state.activePage = "library";
    state.query = "";
    persistPreferences();
    notification = isTauri()
      ? `${app.name} установлен. Теперь его можно запускать из хаба.`
      : `Установщик ${app.name} скачан. Запустите MSI, чтобы установить приложение.`;
  } catch (error) {
    notification = `Не удалось ${operation} ${app.name}: ${errorMessage(error)}`;
  } finally {
    state.installingApps.delete(app.id);
    state.installStatuses.delete(app.id);
    render();
    if (notification) showToast(notification);
  }
}

async function launchInstalledApp(app) {
  try {
    await invoke("launch_app", { appId: app.id });
  } catch (error) {
    render();
    showToast(`Не удалось запустить ${app.name}: ${errorMessage(error)}`);
  }
}

async function uninstallInstalledApp(app) {
  if (state.uninstallingApps.has(app.id)) return;
  state.uninstallingApps.add(app.id);
  render({ keepScroll: true });
  let notification;
  try {
    await invoke("uninstall_app", { appId: app.id });
    await refreshInstalledApps();
    if (state.installedApps.has(app.id)) {
      throw new Error("Windows всё ещё сообщает, что приложение установлено.");
    }
    notification = `${app.name} удалён.`;
  } catch (error) {
    notification = `Не удалось удалить ${app.name}: ${errorMessage(error)}`;
  } finally {
    state.uninstallingApps.delete(app.id);
    render();
    if (notification) showToast(notification);
  }
}

function authErrorMessage(error) {
  const message = errorMessage(error, "");
  if (/invalid login credentials/i.test(message)) return "Неверный email или пароль.";
  if (/email not confirmed/i.test(message)) return "Подтвердите email по ссылке из письма, затем войдите.";
  if (/user already registered/i.test(message)) return "Аккаунт с таким email уже существует. Попробуйте войти.";
  if (/password should be at least/i.test(message)) return "Пароль должен содержать не менее 6 символов.";
  if (/invalid email/i.test(message)) return "Проверьте правильность email.";
  if (/failed to fetch|networkerror|network request failed/i.test(message)) return "Не удалось связаться с Supabase. Проверьте подключение к интернету и попробуйте ещё раз.";
  return message || "Не удалось связаться с Supabase. Проверьте подключение к интернету и попробуйте ещё раз.";
}

async function submitAuthForm(form) {
  if (!supabase || state.authPending) return;
  const formData = new FormData(form);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "").trim();
  if (state.authMode === "sign-up" && !name) {
    state.authMessage = { type: "error", text: "Укажите имя, которое будет отображаться в профиле." };
    render();
    return;
  }
  const submitButton = form.querySelector('[type="submit"]');

  state.authPending = true;
  state.authMessage = null;
  submitButton.disabled = true;
  submitButton.textContent = "Подождите…";

  try {
    const result = state.authMode === "sign-up"
      ? await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      state.authMessage = { type: "error", text: authErrorMessage(result.error) };
    } else if (state.authMode === "sign-up" && !result.data.session) {
      state.authMode = "sign-in";
      state.authMessage = {
        type: "success",
        text: "Аккаунт создан. Проверьте почту и подтвердите email, затем войдите.",
      };
    }
  } catch (error) {
    state.authMessage = { type: "error", text: authErrorMessage(error) };
  } finally {
    state.authPending = false;
    render();
  }
}

root.addEventListener("click", async (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;

  if (target.dataset.authMode) {
    state.authMode = target.dataset.authMode;
    state.authMessage = null;
    render();
    return;
  }

  if (target.dataset.updateAction === "check") {
    void checkForUpdates();
    return;
  }
  if (target.dataset.updateAction === "install") {
    void installHubUpdate();
    return;
  }

  if (target.dataset.storageOpen !== undefined) {
    openStorageSetup();
    return;
  }

  if (target.dataset.storageAction === "cancel") {
    state.storageDialogOpen = false;
    state.pendingStorageAppId = null;
    render();
    return;
  }

  if (target.dataset.storageAction === "relocate-hub") {
    await relocateHubInstallation();
    return;
  }

  if (target.dataset.storageAction === "save") {
    const drive = root.querySelector("#storage-drive")?.value;
    if (!drive) {
      showToast("Выберите доступный диск.");
      return;
    }
    target.disabled = true;
    try {
      if (state.pendingStorageAppId) {
        localStorage.setItem(pendingInstallStorageKey, state.pendingStorageAppId);
      }
      state.storageRoot = await invoke("configure_storage_root", { drive });
      state.storageDialogOpen = false;
      state.storageNeedsRestart = true;
      const storageInfo = await invoke("get_storage_info");
      state.hubRelocationRequired = storageInfo.hubRelocationRequired === true;
      render();
      if (state.hubRelocationRequired) {
        await relocateHubInstallation();
      } else {
        showToast("Папка создана. Hub перезапустится и продолжит установку приложения…");
        await relaunch();
      }
    } catch (error) {
      state.storageError = errorMessage(error);
      console.error("[Limon Hub] Could not configure shared storage:", error);
      render();
      showToast(`Не удалось настроить хранилище: ${state.storageError}`);
    }
    return;
  }

  if (target.dataset.authAction === "sign-out") {
    target.disabled = true;
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        state.authMessage = { type: "error", text: authErrorMessage(error) };
        render();
        if (updaterEnabled && isTauri()) void checkForUpdates({ automatic: true });
      }
    } catch (error) {
      state.authMessage = { type: "error", text: authErrorMessage(error) };
      render();
    }
    return;
  }

  if (target.dataset.page) {
    event.preventDefault();
    state.activePage = target.dataset.page;
    state.query = "";
    render();
    if (state.activePage === "library" && isTauri()) {
      void refreshInstalledApps().then(render).catch((error) => {
        showToast(`Не удалось проверить установленные приложения: ${errorMessage(error)}`);
      });
    }
    return;
  }

  if (target.hasAttribute("data-catalog-retry")) {
    void Promise.all([loadAppCatalog(), refreshInstalledApps()]).then(render).catch((error) => {
      render();
      showToast(`Не удалось обновить библиотеку: ${errorMessage(error)}`);
    });
    return;
  }

  if (target.dataset.appAction) {
    const app = state.apps.find((item) => item.id === target.dataset.appAction);
    if (!app) return;
    if (target.dataset.action === "install" && !state.installedApps.has(app.id)) void installApp(app);
    else if (target.dataset.action === "launch" && state.installedApps.has(app.id)) void launchInstalledApp(app);
    return;
  }

  if (target.dataset.removeApp) {
    const app = state.apps.find((item) => item.id === target.dataset.removeApp);
    if (app && state.installedApps.has(app.id)) void uninstallInstalledApp(app);
    return;
  }

  if (target.dataset.theme) {
    state.settings.theme = target.dataset.theme === "dark" ? "dark" : "light";
    persistPreferences();
    render();
    showToast(state.settings.theme === "dark"
      ? (state.settings.language === "en" ? "Dark theme enabled" : "Тёмная тема включена")
      : (state.settings.language === "en" ? "Light theme enabled" : "Светлая тема включена"));
    return;
  }

  if (target.dataset.appearance) {
    state.settings.appearance = ["translucent", "liquid"].includes(target.dataset.appearance)
      ? target.dataset.appearance
      : "standard";
    persistPreferences();
    render();
    return;
  }

  if (target.dataset.language) {
    state.settings.language = normalizeLanguage(target.dataset.language);
    persistPreferences();
    render();
    return;
  }

  if (target.matches(".switch")) {
    const key = target.dataset.setting;
    const enabled = !state.settings[key];
    state.settings[key] = enabled;
    target.classList.toggle("is-on", enabled);
    target.setAttribute("aria-checked", String(enabled));
    persistPreferences();
    applyAppearancePreferences();
    showToast(enabled ? "Настройка включена" : "Настройка выключена");
  }
});

root.addEventListener("change", (event) => {
  if (event.target.id !== "storage-drive") return;
  state.storageDriveSelection = event.target.value;
});

root.addEventListener("submit", (event) => {
  if (event.target.id !== "auth-form") return;
  event.preventDefault();
  void submitAuthForm(event.target);
});

root.addEventListener("input", (event) => {
  if (event.target.id !== "catalog-search") return;
  state.query = event.target.value;
  if (state.activePage !== "apps") {
    state.activePage = "apps";
    render();
    const input = root.querySelector("#catalog-search");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    return;
  }
  const cursor = event.target.selectionStart;
  render();
  const input = root.querySelector("#catalog-search");
  input?.focus();
  input?.setSelectionRange(cursor, cursor);
});

document.addEventListener("keydown", (event) => {
  if (!state.user) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    root.querySelector("#catalog-search")?.focus();
  }
  if (event.key === "Escape" && document.activeElement?.id === "catalog-search") {
    state.query = "";
    render();
  }
  if (event.key === "Escape" && state.storageDialogOpen) {
    state.storageDialogOpen = false;
    state.pendingStorageAppId = null;
    render();
  }
});

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user || null;
    const previousId = state.user?.id;
    state.user = nextUser ? userProfile(nextUser) : null;
    if (state.user && state.user.id !== previousId) {
      loadPreferences(state.user.id);
      void Promise.all([loadAppCatalog(), refreshInstalledApps()]).then(async () => {
        render();
        await resumePendingInstall();
      }).catch((error) => {
        render();
        showToast(`Не удалось проверить приложения на этом устройстве: ${errorMessage(error)}`);
      });
    }
    if (!state.user && previousId) {
      state.activePage = "home";
      state.query = "";
      state.installedApps = new Set();
      state.apps = [];
      state.catalogLoading = false;
      state.catalogError = null;
      state.downloads = [];
      state.settings = { ...defaultSettings };
    }
    if (!state.user) loadUnauthenticatedPreferences();
    state.authLoading = false;
    render();
    void finishStartup();
    if (state.storageError) {
      showToast(`Ошибка общего хранилища: ${state.storageError}`);
    }
  });
} else {
  state.authLoading = false;
  loadUnauthenticatedPreferences();
}

render();
if (!supabase) void finishStartup();
else {
  window.setTimeout(() => {
    if (startupFinishPromise) return;
    state.authLoading = false;
    loadUnauthenticatedPreferences();
    render();
    void finishStartup();
  }, 10000);
}
void loadStorageInfo();
