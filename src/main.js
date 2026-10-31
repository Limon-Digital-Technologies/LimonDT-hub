import "./styles.css";
import { isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import packageJson from "../package.json";
import { apps } from "./data/catalog.js";
import { applyCalculatorInput, createCalculatorState } from "../apps/Limon-Calculator/src/calculator-engine.js";
import { supabase, supabaseConfigError } from "./lib/supabase.js";
import { renderApp, renderAuth } from "./ui/render.js";

const root = document.querySelector("#app");
const updaterEnabled = import.meta.env.VITE_UPDATER_ENABLED === "true";
const legacyStorageKey = "limon-hub-preferences";
const defaultSettings = { animations: true, compact: false };
const state = {
  activePage: "home",
  query: "",
  installedApps: new Set(),
  downloadingApps: new Set(),
  downloads: [],
  calculator: createCalculatorState(),
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
  const knownApps = new Set(apps.map((app) => app.id));
  state.installedApps = new Set((preferences.installedApps || []).filter((id) => knownApps.has(id)));
  state.downloads = (preferences.downloads || []).filter((item) => knownApps.has(item.id));
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
      installedApps: [...state.installedApps],
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
  if (state.activePage === "calculator") updateCalculatorDisplay();
}

function showToast(message) {
  const region = root.querySelector(".toast-region");
  if (!region) return;
  region.innerHTML = `<div class="toast">${message}</div>`;
  window.setTimeout(() => region.querySelector(".toast")?.classList.add("toast--leaving"), 2400);
  window.setTimeout(() => { region.innerHTML = ""; }, 2800);
}

function updateCalculatorDisplay() {
  const display = root.querySelector("[data-calculator-display]");
  const expression = root.querySelector("[data-calculator-expression]");
  if (!display || !expression) return;
  display.textContent = state.calculator.display;
  expression.textContent = state.calculator.expression;
}

function inputCalculator(action, value) {
  applyCalculatorInput(state.calculator, action, value);
  updateCalculatorDisplay();
}

function fetchAppResource(url, options) {
  return isTauri() ? tauriFetch(url, options) : fetch(url, options);
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

async function downloadApp(app) {
  if (state.downloadingApps.has(app.id)) return;
  state.downloadingApps.add(app.id);
  render({ keepScroll: true });

  let notification;
  try {
    const releaseResponse = await fetchAppResource(app.releaseApi);
    if (releaseResponse.status === 404) {
      throw new Error("Публичный GitHub-репозиторий или релизы приложений ещё не опубликованы.");
    }
    if (!releaseResponse.ok) throw new Error(`GitHub API ответил с кодом ${releaseResponse.status}.`);
    const release = await releaseResponse.json();
    if (release.draft || release.prerelease) throw new Error("Последний релиз приложения ещё не опубликован как стабильный.");
    const asset = release.assets?.find((item) => item.name === app.assetName);
    const checksumAsset = release.assets?.find((item) => item.name === app.checksumName);
    if (!asset || !checksumAsset) {
      throw new Error(`В последнем релизе отсутствуют ${app.assetName} или ${app.checksumName}.`);
    }
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 100 * 1024 * 1024) {
      throw new Error("Размер установщика отсутствует или превышает ограничение в 100 МБ.");
    }
    const allowedDownloadPrefix = `https://github.com/${app.repository}/releases/download/`;
    if (!asset.browser_download_url?.startsWith(allowedDownloadPrefix)
      || !checksumAsset.browser_download_url?.startsWith(allowedDownloadPrefix)) {
      throw new Error("GitHub вернул некорректный адрес установщика.");
    }

    const [installerResponse, checksumResponse] = await Promise.all([
      fetchAppResource(asset.browser_download_url),
      fetchAppResource(checksumAsset.browser_download_url),
    ]);
    if (!installerResponse.ok) throw new Error(`Не удалось скачать установщик: HTTP ${installerResponse.status}.`);
    if (!checksumResponse.ok) throw new Error(`Не удалось скачать контрольную сумму: HTTP ${checksumResponse.status}.`);
    const installerBytes = new Uint8Array(await installerResponse.arrayBuffer());
    if (installerBytes.byteLength !== asset.size) {
      throw new Error("Размер скачанного установщика не совпадает с размером релиза.");
    }
    const checksumText = await checksumResponse.text();
    const expectedHash = checksumText.trim().match(/^([a-f\d]{64})\s+/i)?.[1]?.toLowerCase();
    if (!expectedHash) throw new Error("В релизе отсутствует корректная SHA-256 контрольная сумма.");
    const hashBuffer = await crypto.subtle.digest("SHA-256", installerBytes);
    const actualHash = [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actualHash !== expectedHash) throw new Error("Контрольная сумма установщика не совпадает. Файл не сохранён.");

    if (isTauri()) {
      const path = await save({
        defaultPath: app.fileName,
        filters: [{ name: "Установщик Windows", extensions: ["msi"] }],
      });
      if (!path) {
        notification = "Скачивание отменено.";
        return;
      }
      await writeFile(path, installerBytes);
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

    state.installedApps.add(app.id);
    state.downloads.push({
      id: app.id,
      fileName: app.fileName,
      downloadedAt: new Date().toISOString(),
      ...(isTauri() ? { path: "Сохранён через диалог выбора файла" } : {}),
    });
    state.activePage = "library";
    state.query = "";
    persistPreferences();
    notification = `Установщик ${app.name} скачан и добавлен в библиотеку. Откройте MSI, чтобы установить приложение.`;
  } catch (error) {
    notification = `Не удалось скачать ${app.name}: ${error.message}`;
  } finally {
    state.downloadingApps.delete(app.id);
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
    return;
  }

  if (target.dataset.appAction) {
    const app = apps.find((item) => item.id === target.dataset.appAction);
    if (!app) return;
    if (target.dataset.action === "download" && !state.installedApps.has(app.id)) {
      void downloadApp(app);
    } else if (state.installedApps.has(app.id)) {
      state.activePage = app.id;
      state.calculator = createCalculatorState();
      render();
    }
    return;
  }

  if (target.dataset.removeApp) {
    const app = apps.find((item) => item.id === target.dataset.removeApp);
    state.installedApps.delete(target.dataset.removeApp);
    persistPreferences();
    render();
    if (app) showToast(`${app.name} удалён из библиотеки`);
    return;
  }

  if (target.dataset.calculatorAction) {
    inputCalculator(target.dataset.calculatorAction, target.dataset.value);
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
  if (state.activePage === "calculator" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const focusedInput = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (!focusedInput && /^\d$/.test(event.key)) inputCalculator("digit", event.key);
    else if (!focusedInput && event.key === ".") inputCalculator("decimal");
    else if (!focusedInput && ["+", "-", "*", "/"].includes(event.key)) inputCalculator("operator", event.key);
    else if (!focusedInput && (event.key === "Enter" || event.key === "=")) inputCalculator("equals");
    else if (!focusedInput && event.key === "Backspace") inputCalculator("delete");
    else if (!focusedInput && event.key === "Escape") inputCalculator("clear");
  }
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
    if (state.user && state.user.id !== previousId) loadPreferences(state.user.id);
    if (!state.user && previousId) {
      state.activePage = "home";
      state.query = "";
      state.installedApps = new Set();
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
