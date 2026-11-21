import { navigation, pageCopy } from "../data/catalog.js";
import { icon } from "./icons.js";
import { t } from "../lib/i18n.js";

function navButton(item, activePage, downloadCount) {
  return `
    <button class="nav-item ${activePage === item.id ? "is-active" : ""}" data-page="${item.id}" aria-current="${activePage === item.id ? "page" : "false"}">
      <span class="nav-item__icon">${icon(item.icon)}</span>
      <span class="nav-item__label">${item.label}</span>
      ${item.id === "downloads" && downloadCount ? `<span class="nav-item__count">${downloadCount}</span>` : ""}
    </button>`;
}

function appCard(app, { installed = false, downloaded = false, installing = false, installStatus, uninstalling = false, compact = false, downloadOnly = false, language = "ru" } = {}) {
  const action = installing ? installStatus || (language === "en" ? "Installing…" : "Устанавливаем…") : installed ? t(language, "launch") : t(language, "install");
  const iconMarkup = app.id === "calculator"
    ? '<img class="app-icon__image" src="/assets/calculator-logo.png" alt="" />'
    : `<span>${escapeHtml(app.icon)}</span>`;
  const actionMarkup = downloadOnly
    ? ""
    : `<button class="button button--primary app-action" data-app-action="${app.id}" data-action="${installed ? "launch" : "install"}" ${installing || uninstalling ? "disabled aria-busy=\"true\"" : ""}>${installing ? "" : icon(installed ? "arrow" : "download")} ${action}</button>`;
  const category = app.id === "calculator" && language === "en"
    ? t(language, "appCategoryUtilities")
    : app.category;
  const description = app.id === "calculator"
    ? t(language, "appDescriptionCalculator")
    : app.description;

  return `
    <article class="app-card ${compact ? "app-card--compact" : ""}">
      <div class="app-card__top">
        <span class="app-icon app-icon--${app.color} ${compact ? "app-icon--small" : ""}">${iconMarkup}</span>
        <span class="app-version">v${escapeHtml(app.version)}</span>
      </div>
      <div class="app-card__copy">
        <span class="app-card__category">${escapeHtml(category)}</span>
        <h3>${escapeHtml(app.name)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="app-card__actions">
        ${actionMarkup}
        ${installed ? `<button class="button button--secondary app-remove" data-remove-app="${app.id}" ${uninstalling || installing ? "disabled" : ""}>${uninstalling ? t(language, "removeStarted") : t(language, "remove")}</button>` : ""}
        ${downloaded ? `<span class="download-status">${installed ? t(language, "installed") : t(language, "downloaded")}</span>` : ""}
      </div>
    </article>`;
}

function pluralize(count, one, few, many) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return one;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

function homePage({ apps, installedApps, downloads, installingApps, installStatuses, catalogLoading, catalogError, language }) {
  const installedCount = installedApps.size;
  const downloadCount = downloads.length;

  return `
    <section class="welcome-banner">
      <div class="welcome-banner__content">
        <span class="eyebrow eyebrow--light">${language === "en" ? "LIMON DIGITAL TECHNOLOGIES ECOSYSTEM" : "ЭКОСИСТЕМА LIMON DIGITAL TECHNOLOGIES"}</span>
        <h1>${t(language, "welcomeTitleA")}<br /><span>${t(language, "welcomeTitleB")}</span></h1>
        <p>${t(language, "welcomeText")}</p>
        <button class="button button--light" data-page="apps">${t(language, "openApps")} ${icon("arrow")}</button>
      </div>
      <div class="welcome-banner__art" aria-hidden="true">
        <div class="orbit orbit--one"></div><div class="orbit orbit--two"></div>
        <div class="hero-logo"><img src="/assets/HubLogo.png" alt="" /></div>
        <span class="hero-spark hero-spark--one">✦</span><span class="hero-spark hero-spark--two">✧</span>
      </div>
      <span class="welcome-banner__glow" aria-hidden="true"></span>
    </section>

    <section class="content-section">
      <div class="section-heading">
        <div><span class="eyebrow">${t(language, "welcomeEyebrow")}</span><h2>${t(language, "limonApps")}</h2></div>
        <button class="text-button" data-page="apps">${t(language, "allApps")} ${icon("arrow")}</button>
      </div>
      ${catalogError
        ? `<p class="catalog-notice">${escapeHtml(catalogError)} <button class="text-button" data-catalog-retry>${t(language, "retry")}</button></p>`
        : catalogLoading
          ? `<p class="catalog-notice">${t(language, "loadingCatalog")}</p>`
          : `<div class="app-grid app-grid--featured">${apps.map((app) => appCard(app, { installed: installedApps.has(app.id), downloaded: downloads.some((item) => item.id === app.id), installing: installingApps.has(app.id), installStatus: installStatuses.get(app.id), compact: true, language })).join("")}</div>`}
    </section>

    <section class="hub-overview">
      <button class="overview-card" data-page="library"><span class="overview-icon overview-icon--library">${icon("books")}</span><span><strong>${t(language, "library")}</strong><small>${installedCount ? `${installedCount} ${language === "en" ? "in collection" : "в коллекции"}` : t(language, "libraryApps")}</small></span>${icon("chevron")}</button>
      <button class="overview-card" data-page="downloads"><span class="overview-icon overview-icon--downloads">${icon("download")}</span><span><strong>${t(language, "downloads")}</strong><small>${downloadCount ? `${downloadCount} ${t(language, "downloadedCount")}` : t(language, "downloadHistoryEmpty")}</small></span>${icon("chevron")}</button>
    </section>`;
}

function catalogPage(page, { apps, installedApps, downloads, installingApps, installStatuses, uninstallingApps, query, catalogLoading, catalogError, language }) {
  const copy = pageCopy[page];

  const catalog = page === "library"
    ? apps.filter((app) => installedApps.has(app.id))
    : page === "downloads"
      ? [...downloads].reverse().map((download) => apps.find((app) => app.id === download.id)).filter(Boolean)
      : apps;
  const matchingApps = catalog.filter((app) => `${app.name} ${app.category} ${app.description}`.toLowerCase().includes(query.toLowerCase()));
  const installed = page === "library";
  const count = matchingApps.length;
  const word = page === "downloads"
    ? (language === "en" ? (count === 1 ? "download" : "downloads") : pluralize(count, "загрузка", "загрузки", "загрузок"))
    : (language === "en" ? (count === 1 ? "application" : "applications") : pluralize(count, "приложение", "приложения", "приложений"));

  const catalogStatus = page === "apps" && catalogLoading
    ? `<div class="empty-state"><h2>${language === "en" ? "Loading catalog" : "Загружаем каталог"}</h2><p>${language === "en" ? "Getting applications from Supabase." : "Получаем список приложений из Supabase."}</p></div>`
    : page === "apps" && catalogError
      ? `<div class="empty-state"><h2>${language === "en" ? "Could not load catalog" : "Не удалось загрузить каталог"}</h2><p>${escapeHtml(catalogError)}</p><button class="button button--primary" data-catalog-retry>${t(language, "retry")}</button></div>`
      : matchingApps.length
        ? `<div class="app-grid">${matchingApps.map((app) => appCard(app, { installed: installed || installedApps.has(app.id), downloaded: page === "downloads", installing: installingApps.has(app.id), installStatus: installStatuses.get(app.id), uninstalling: uninstallingApps.has(app.id), compact: false, downloadOnly: page === "downloads", language })).join("")}</div>`
        : `<div class="empty-state"><span class="empty-state__icon">${icon(page === "apps" ? "grid" : page === "downloads" ? "download" : "books")}</span><h2>${page === "apps" && query ? t(language, "notFoundTitle") : page === "apps" ? t(language, "noAppsTitle") : page === "downloads" ? t(language, "noDownloadsTitle") : t(language, "emptyLibraryTitle")}</h2><p>${page === "apps" ? query ? t(language, "notFoundText") : t(language, "noAppsText") : page === "downloads" ? t(language, "noDownloadsText") : t(language, "emptyLibraryText")}</p>${page !== "apps" ? `<button class="button button--primary" data-page="apps">${t(language, "goToApps")} ${icon("arrow")}</button>` : ""}</div>`;
  const intro = language === "en"
    ? {
        apps: ["PRODUCTS BY LIMON", "Applications", "Applications from the Limon Digital Technologies ecosystem."],
        downloads: ["DOWNLOAD HISTORY", "Downloads", "Applications downloaded on this device."],
        library: ["YOUR COLLECTION", "Library", "Installed applications — launch or remove them from here."],
      }[page]
    : [copy.eyebrow, copy.title, copy.description];

  return `
    <section class="page-intro"><span class="eyebrow">${intro[0]}</span><h1>${intro[1]}</h1><p>${intro[2]}</p></section>
    <div class="catalog-toolbar"><span>${count} ${word}</span></div>
    ${catalogStatus}`;
}

function settingsPage({ updaterStatus, updaterChecking, updateAvailableVersion, updateInstalling, version, settings, language }) {
  const theme = settings?.theme ?? "light";
  const appearance = settings?.appearance ?? "standard";
  return `
    <section class="page-intro"><span class="eyebrow">${t(language, "personalize")}</span><h1>${t(language, "settings")}</h1><p>${t(language, "appearanceSettings")}</p></section>
    <section class="settings-panel">
      <div class="settings-row"><div><strong>${t(language, "theme")}</strong><p>${t(language, "themeDescription")}</p></div><div class="segmented-control" role="group" aria-label="${t(language, "theme")}"><button class="segment ${theme === "light" ? "is-selected" : ""}" data-theme="light">${t(language, "themeLight")}</button><button class="segment ${theme === "dark" ? "is-selected" : ""}" data-theme="dark">${t(language, "themeDark")}</button></div></div>
      <div class="settings-row"><div><strong>${t(language, "appearance")}</strong><p>${language === "en" ? "Choose the visual surface of the hub." : "Выберите визуальный стиль оболочки."}</p></div><div class="segmented-control segmented-control--appearance" role="group" aria-label="${t(language, "appearance")}"><button class="segment ${appearance === "standard" ? "is-selected" : ""}" data-appearance="standard">${t(language, "standard")}</button><button class="segment ${appearance === "translucent" ? "is-selected" : ""}" data-appearance="translucent">${t(language, "translucent")}</button><button class="segment ${appearance === "liquid" ? "is-selected" : ""}" data-appearance="liquid">${t(language, "liquid")}</button></div></div>
      <div class="settings-row"><div><strong>${t(language, "language")}</strong><p>${language === "en" ? "Interface language." : "Язык интерфейса."}</p></div><div class="segmented-control" role="group" aria-label="${t(language, "language")}"><button class="segment ${language === "ru" ? "is-selected" : ""}" data-language="ru">RU</button><button class="segment ${language === "en" ? "is-selected" : ""}" data-language="en">EN</button></div></div>
      <div class="settings-row"><div><strong>${t(language, "animations")}</strong><p>${t(language, "animationsDescription")}</p></div><button class="switch ${settings?.animations === false ? "" : "is-on"}" data-setting="animations" role="switch" aria-checked="${settings?.animations !== false}" aria-label="${t(language, "animations")}"><span></span></button></div>
      <div class="settings-row"><div><strong>${t(language, "compact")}</strong><p>${t(language, "compactDescription")}</p></div><button class="switch ${settings?.compact ? "is-on" : ""}" data-setting="compact" role="switch" aria-checked="${Boolean(settings?.compact)}" aria-label="${t(language, "compact")}"><span></span></button></div>
      <div class="settings-row settings-row--updates">
        <div><strong>${t(language, "hubUpdate")}</strong><p data-updater-status>${escapeHtml(updaterStatus)}</p></div>
        <div class="settings-row__actions">
          ${updateAvailableVersion
            ? `<button class="button button--primary" data-update-action="install" ${updateInstalling ? "disabled" : ""}>${updateInstalling ? (language === "en" ? "Installing…" : "Устанавливаем…") : `${t(language, "install")} v${escapeHtml(updateAvailableVersion)}`}</button>`
            : ""}
          <button class="button button--secondary" data-update-action="check" ${updaterChecking || updateInstalling ? "disabled" : ""}>${updaterChecking ? (language === "en" ? "Checking…" : "Проверяем…") : t(language, "check")}</button>
        </div>
      </div>
    </section>
    <div class="settings-footer"><img src="/assets/HubLogo.png" alt="" /><span>Limon Digital Tech. Hub <small>${t(language, "version")} ${escapeHtml(version)}</small></span></div>`;
}

export function renderApp({
  activePage,
  apps = [],
  catalogLoading = false,
  catalogError = null,
  query = "",
  downloads = [],
  installedApps = new Set(),
  installingApps = new Set(),
  installStatuses = new Map(),
  uninstallingApps = new Set(),
  settings,
  user,
  updaterStatus,
  updaterChecking,
  updateAvailableVersion,
  updateInstalling,
  version,
  language = "ru",
}) {
  const page = activePage === "settings"
    ? settingsPage({ updaterStatus, updaterChecking, updateAvailableVersion, updateInstalling, version, settings, language })
    : activePage === "home"
      ? homePage({ apps, installedApps, downloads, installingApps, installStatuses, catalogLoading, catalogError, language })
      : catalogPage(activePage, { apps, installedApps, downloads, installingApps, installStatuses, uninstallingApps, query, catalogLoading, catalogError, language });
  const currentTitle = activePage === "settings"
    ? t(language, "settings")
    : activePage === "home"
      ? t(language, "home")
      : t(language, activePage === "downloads" ? "downloads" : activePage === "library" ? "library" : "apps");

  const navLabels = {
    home: t(language, "home"),
    apps: t(language, "apps"),
    downloads: t(language, "downloads"),
    library: t(language, "library"),
  };
  const translatedNavigation = (section) => navigation
    .filter((item) => item.section === section)
    .map((item) => navButton({ ...item, label: navLabels[item.id] }, activePage, downloads.length))
    .join("");

  return `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#" data-page="home" aria-label="Limon Hub — главная">
          <img class="brand__logo" src="/assets/HubLogo.png" alt="" />
          <span class="brand__copy"><strong>Limon Hub</strong><small>Digital Technologies</small></span>
        </a>
        <div class="sidebar__divider"></div>
        <nav class="sidebar__nav" aria-label="${language === "en" ? "Main menu" : "Главное меню"}">
          <span class="nav-caption">${t(language, "ecosystem")}</span>
          ${translatedNavigation("main")}
          <span class="nav-caption nav-caption--library">${t(language, "collection")}</span>
          ${translatedNavigation("library")}
        </nav>
        <div class="sidebar__bottom">
          ${navButton({ id: "settings", label: t(language, "settings"), icon: "settings" }, activePage, downloads.length)}
          <div class="sidebar__version">${t(language, "createdWithCare")} <span>·</span> v${escapeHtml(version)}</div>
        </div>
      </aside>

      <main class="workspace">
        <header class="topbar">
          <div class="breadcrumbs"><span>${language === "en" ? "Limon ecosystem" : "Экосистема Limon"}</span>${icon("chevron")}<strong>${currentTitle}</strong></div>
          <div class="topbar__actions">
            <label class="search-box">${icon("search")}<input id="catalog-search" type="search" placeholder="${t(language, "search")}" value="${escapeAttribute(query)}" aria-label="${t(language, "search")}" /><kbd>Ctrl K</kbd></label>
            <button class="profile-button" data-auth-action="sign-out" aria-label="${t(language, "signOut")} ${escapeHtml(user.name)}">
              <span class="profile-avatar">${escapeHtml(user.initials)}</span>
              <span class="profile-copy"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></span>
              <span class="profile-sign-out">${t(language, "signOut")}</span>
            </button>
          </div>
        </header>
        ${updateAvailableVersion
          ? `<section class="update-banner" role="status"><span>${language === "en" ? "A Limon Hub update is available" : "Доступно обновление Limon Hub"} <strong>v${escapeHtml(updateAvailableVersion)}</strong></span><button class="button button--primary" data-update-action="install" ${updateInstalling ? "disabled" : ""}>${updateInstalling ? (language === "en" ? "Installing…" : "Устанавливаем…") : (language === "en" ? "Install and restart" : "Установить и перезапустить")}</button></section>`
          : ""}
        <div class="workspace-scroll"><div class="page-content">${page}</div></div>
        <div class="toast-region" aria-live="polite"></div>
      </main>
    </div>`;
}

export function renderAuth({ mode, pending, message, configError, language = "ru" }) {
  const isSignUp = mode === "sign-up";
  const disabled = pending || configError;
  const notice = message
    ? `<div class="auth-notice ${message.type === "error" ? "auth-notice--error" : "auth-notice--success"}" role="${message.type === "error" ? "alert" : "status"}">${escapeHtml(message.text)}</div>`
    : "";
  const configurationNotice = configError
    ? `<div class="auth-notice auth-notice--error" role="alert">${language === "en" ? "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env, then restart the app." : "Supabase не настроен. Проверьте VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в файле .env, затем перезапустите приложение."}</div>`
    : "";

  return `
    <main class="auth-shell">
      <div class="auth-language-control" role="group" aria-label="${t(language, "language")}">
        <button class="segment ${language === "ru" ? "is-selected" : ""}" data-language="ru">RU</button>
        <button class="segment ${language === "en" ? "is-selected" : ""}" data-language="en">EN</button>
      </div>
      <section class="auth-brand-panel">
        <a class="brand auth-brand" href="#" aria-label="Limon Hub">
          <img class="brand__logo" src="/assets/HubLogo.png" alt="" />
          <span class="brand__copy"><strong>Limon Hub</strong><small>Digital Technologies</small></span>
        </a>
        <div class="auth-brand-panel__copy">
          <span class="eyebrow eyebrow--light">${t(language, "unifiedEcosystem")}</span>
          <h1>${t(language, "authHeroTitleA")}<br /><span>${t(language, "authHeroTitleB")}</span></h1>
          <p>${t(language, "authHeroText")}</p>
        </div>
        <div class="auth-brand-panel__art" aria-hidden="true">
          <div class="orbit orbit--one"></div><div class="orbit orbit--two"></div>
          <div class="hero-logo"><img src="/assets/HubLogo.png" alt="" /></div>
          <span class="hero-spark hero-spark--one">✦</span><span class="hero-spark hero-spark--two">✧</span>
        </div>
        <span class="auth-brand-panel__footer">Limon Digital Technologies</span>
      </section>
      <section class="auth-form-panel">
        <div class="auth-form-wrap">
          <span class="eyebrow">${t(language, "englishAccount")}</span>
          <h2>${isSignUp ? t(language, "createAccount") : t(language, "welcomeBack")}</h2>
          <p class="auth-subtitle">${isSignUp ? t(language, "joinText") : t(language, "signInText")}</p>
          <div class="auth-mode-switch" role="tablist" aria-label="${language === "en" ? "Account mode" : "Режим аккаунта"}">
            <button class="auth-mode ${!isSignUp ? "is-selected" : ""}" type="button" role="tab" aria-selected="${!isSignUp}" data-auth-mode="sign-in">${t(language, "signIn")}</button>
            <button class="auth-mode ${isSignUp ? "is-selected" : ""}" type="button" role="tab" aria-selected="${isSignUp}" data-auth-mode="sign-up">${t(language, "registration")}</button>
          </div>
          ${configurationNotice}
          ${notice}
          <form id="auth-form" class="auth-form">
            ${isSignUp ? `<label class="auth-field"><span>${t(language, "name")}</span><input name="name" type="text" autocomplete="name" placeholder="${t(language, "namePlaceholder")}" maxlength="80" required ${disabled ? "disabled" : ""} /></label>` : ""}
            <label class="auth-field"><span>Email</span><input name="email" type="email" autocomplete="email" placeholder="name@example.com" maxlength="254" required ${disabled ? "disabled" : ""} /></label>
            <label class="auth-field"><span>${t(language, "password")}</span><input name="password" type="password" autocomplete="${isSignUp ? "new-password" : "current-password"}" placeholder="${isSignUp ? t(language, "passwordPlaceholderSignUp") : t(language, "passwordPlaceholderSignIn")}" minlength="6" required ${disabled ? "disabled" : ""} /></label>
            <button class="button button--primary auth-submit" type="submit" ${disabled ? "disabled" : ""}>${pending ? t(language, "pleaseWait") : isSignUp ? t(language, "createAccount") : t(language, "signIn")} ${icon("arrow")}</button>
          </form>
          <p class="auth-privacy">${t(language, "accountProtected")}</p>
        </div>
      </section>
    </main>`;
}

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
}
