import "./styles.css";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { BaseDirectory, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import packageJson from "../package.json";
import { fetchAppCatalog } from "./data/app-catalog.js";
import { supabase, supabaseConfigError } from "./lib/supabase.js";
import { renderApp, renderAuth } from "./ui/render.js";

const root = document.querySelector("#app");
const updaterEnabled = import.meta.env.VITE_UPDATER_ENABLED === "true";
const legacyStorageKey = "limon-hub-preferences";
const defaultSettings = { animations: true, compact: false };
const maxInstallerBytes = 100 * 1024 * 1024;
const state = {
  activePage: "home",
  query: "",
  apps: [],
  catalogLoading: false,
  catalogError: null,
  installedApps: new Set(),
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
};

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
  const preferences = stored ? JSON.parse(stored) : {};
  state.downloads = preferences.downloads || [];
  state.settings = {
    animations: preferences.settings?.animations ?? defaultSettings.animations,
    compact: preferences.settings?.compact ?? defaultSettings.compact,
  };
}

function persistPreferences() {
  if (!state.user) return;
  localStorage.setItem(
    preferencesKey(state.user.id),
    JSON.stringify({
      downloads: state.downloads,
      settings: state.settings,
    }),
  );
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
        });
    document.body.classList.remove("no-motion", "is-compact");
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
  });
  if (keepScroll) root.querySelector(".workspace-scroll").scrollTop = scrollTop;
  document.body.classList.toggle("no-motion", !state.settings.animations);
  document.body.classList.toggle("is-compact", state.settings.compact);
  root.querySelectorAll(".switch").forEach((button) => {
    const value = state.settings[button.dataset.setting];
    button.classList.toggle("is-on", value);
    button.setAttribute("aria-checked", String(value));
  });
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

async function loadAppCatalog() {
  state.catalogLoading = true;
  state.catalogError = null;
  render();
  try {
    state.apps = await fetchAppCatalog(supabase);
  } catch (error) {
    state.catalogError = error;
    state.apps = [];
  } finally {
    state.catalogLoading = false;
    render();
  }
}

async function refreshInstalledApps() {
  if (!isTauri()) {
    state.installedApps = new Set();
    return;
  }
  const installedIds = await invoke("get_installed_apps");
  const knownApps = new Set(state.apps.map((app) => app.id));
  state.installedApps = new Set(installedIds.filter((id) => knownApps.has(id)));
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
    state.updaterStatus = `Не удалось проверить обновления: ${error.message}`;
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
    state.updaterStatus = `Не удалось установить обновление: ${error.message}`;
    render();
    showToast("Не удалось установить обновление Limon Hub.");
  }
}

async function installApp(app) {
  if (state.installingApps.has(app.id)) return;
  state.installingApps.add(app.id);
  state.installStatuses.set(app.id, "Подключаемся к GitHub…");
  render({ keepScroll: true });

  let notification;
  let operation = "скачать";
  try {
    const repositoryPath = app.repository.split("/").map(encodeURIComponent).join("/");
    const releaseAssetUrl = (fileName) => (
      `https://github.com/${repositoryPath}/releases/latest/download/${encodeURIComponent(fileName)}`
    );
    const installerUrl = releaseAssetUrl(app.assetName);
    const checksumUrl = releaseAssetUrl(app.checksumName);

    state.installStatuses.set(app.id, "Скачиваем установщик…");
    render({ keepScroll: true });
    const [installerResponse, checksumResponse] = await Promise.all([
      fetchAppResource(installerUrl),
      fetchAppResource(checksumUrl),
    ]);
    if (!installerResponse.ok) {
      if (installerResponse.status === 404) {
        throw new Error(`В последнем GitHub-релизе не найден файл ${app.assetName}.`);
      }
      throw new Error(`GitHub не отдал установщик: HTTP ${installerResponse.status}.`);
    }
    if (!checksumResponse.ok) {
      throw new Error(`Не удалось скачать контрольную сумму: HTTP ${checksumResponse.status}.`);
    }
    state.installStatuses.set(app.id, "Проверяем файл и контрольную сумму…");
    render({ keepScroll: true });
    const contentLength = Number(installerResponse.headers.get("content-length"));
    if (!Number.isSafeInteger(contentLength) || contentLength < 8 || contentLength > maxInstallerBytes) {
      throw new Error("Размер установщика неизвестен или превышает ограничение 100 МБ.");
    }
    const installerBytes = new Uint8Array(await installerResponse.arrayBuffer());
    if (installerBytes.byteLength > maxInstallerBytes) {
      throw new Error("Установщик превышает ограничение 100 МБ.");
    }
    if (installerBytes.byteLength < 8
      || installerBytes[0] !== 0xd0
      || installerBytes[1] !== 0xcf
      || installerBytes[2] !== 0x11
      || installerBytes[3] !== 0xe0
      || installerBytes[4] !== 0xa1
      || installerBytes[5] !== 0xb1
      || installerBytes[6] !== 0x1a
      || installerBytes[7] !== 0xe1) {
      throw new Error("GitHub вернул файл, который не является Windows MSI.");
    }
    const checksumText = await checksumResponse.text();
    const expectedHash = checksumText.trim().match(/^([a-f\d]{64})\s+/i)?.[1]?.toLowerCase();
    if (!expectedHash) throw new Error("В релизе отсутствует корректная SHA-256 контрольная сумма.");
    const hashBuffer = await crypto.subtle.digest("SHA-256", installerBytes);
    const actualHash = [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actualHash !== expectedHash) throw new Error("Контрольная сумма установщика не совпадает. Файл не сохранён.");

    if (isTauri()) {
      operation = "установить";
      state.installStatuses.set(app.id, "Запускаем установщик Windows…");
      render({ keepScroll: true });
      const installerDirectory = "installers";
      await mkdir(installerDirectory, { baseDir: BaseDirectory.AppCache, recursive: true });
      await writeFile(`${installerDirectory}/${app.fileName}`, installerBytes, {
        baseDir: BaseDirectory.AppCache,
      });
      await invoke("install_app", { appId: app.id });
      await refreshInstalledApps();
      if (!state.installedApps.has(app.id)) {
        throw new Error("Установщик завершился, но Windows не подтвердила установку приложения.");
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

    state.downloads.push({
      id: app.id,
      fileName: app.fileName,
      downloadedAt: new Date().toISOString(),
    });
    if (isTauri()) state.activePage = "library";
    state.query = "";
    persistPreferences();
    notification = isTauri()
      ? `${app.name} установлен. Теперь его можно запускать из хаба.`
      : `Установщик ${app.name} скачан. Запустите MSI, чтобы установить приложение.`;
  } catch (error) {
    notification = `Не удалось ${operation} ${app.name}: ${error.message}`;
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
    showToast(`Не удалось запустить ${app.name}: ${error.message}`);
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
    notification = `Не удалось удалить ${app.name}: ${error.message}`;
  } finally {
    state.uninstallingApps.delete(app.id);
    render();
    if (notification) showToast(notification);
  }
}

function authErrorMessage(error) {
  const message = error?.message || "";
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
        showToast(`Не удалось проверить установленные приложения: ${error.message}`);
      });
    }
    return;
  }

  if (target.hasAttribute("data-catalog-retry")) {
    void loadAppCatalog().then(refreshInstalledApps).then(render).catch((error) => {
      render();
      showToast(`Не удалось обновить библиотеку: ${error.message}`);
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

  if (target.matches(".switch")) {
    const key = target.dataset.setting;
    const enabled = !state.settings[key];
    state.settings[key] = enabled;
    target.classList.toggle("is-on", enabled);
    target.setAttribute("aria-checked", String(enabled));
    persistPreferences();
    document.body.classList.toggle("no-motion", !state.settings.animations);
    document.body.classList.toggle("is-compact", state.settings.compact);
    showToast(enabled ? "Настройка включена" : "Настройка выключена");
  }
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
});

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user || null;
    const previousId = state.user?.id;
    state.user = nextUser ? userProfile(nextUser) : null;
    if (state.user && state.user.id !== previousId) {
      loadPreferences(state.user.id);
      void loadAppCatalog().then(refreshInstalledApps).then(render).catch((error) => {
        render();
        showToast(`Не удалось проверить приложения на этом устройстве: ${error.message}`);
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
    state.authLoading = false;
    render();
  });
} else {
  state.authLoading = false;
}

render();
