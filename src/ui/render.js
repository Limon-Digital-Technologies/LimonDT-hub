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

function appCard(app, { installed = false, downloaded = false, installing = false, installStatus, uninstalling = false, compact = false, language = "ru" } = {}) {
  const action = installing ? installStatus || (language === "en" ? "Installing…" : "Устанавливаем…") : installed ? t(language, "launch") : t(language, "install");
  const iconMarkup = app.id === "calculator"
    ? '<img class="app-icon__image" src="/assets/calculator-logo.png" alt="" />'
    : `<span>${escapeHtml(app.icon)}</span>`;
  const actionMarkup = `<button class="button button--primary app-action" data-app-action="${app.id}" data-action="${installed ? "launch" : "install"}" ${installing || uninstalling ? "disabled aria-busy=\"true\"" : ""}>${installing ? "" : icon(installed ? "arrow" : "download")} ${action}</button>`;

  return `
    <article class="app-card ${compact ? "app-card--compact" : ""}">
      <div class="app-card__top">
        <span class="app-icon app-icon--${app.color} ${compact ? "app-icon--small" : ""}">${iconMarkup}</span>
        <span class="app-version">v${escapeHtml(app.version)}</span>
      </div>
      <div class="app-card__copy">
        <span class="app-card__category">${escapeHtml(app.category)}</span>
        <h3>${escapeHtml(app.name)}</h3>
        <p>${escapeHtml(app.description)}</p>
      </div>
      <div class="app-card__actions">
        ${actionMarkup}
        ${installed ? `<button class="button button--secondary app-remove" data-remove-app="${app.id}" ${uninstalling || installing ? "disabled" : ""}>${uninstalling ? t(language, "removeStarted") : t(language, "remove")}</button>` : ""}
        ${downloaded ? `<span class="download-status">${installed ? "Установлено" : "Загружено"}</span>` : ""}
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
        <span class="eyebrow eyebrow--light">ЭКОСИСТЕМА LIMON DIGITAL TECHNOLOGIES</span>
        <h1>Ваша цифровая<br /><span>экосистема.</span></h1>
        <p>Продукты, рабочие инструменты и сервисы команды — в едином пространстве.</p>
        <button class="button button--light" data-page="apps">Открыть приложения ${icon("arrow")}</button>
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
        <div><span class="eyebrow">ВАША ЭКОСИСТЕМА</span><h2>Приложения Limon</h2></div>
        <button class="text-button" data-page="apps">Все приложения ${icon("arrow")}</button>
      </div>
      ${catalogError
        ? `<p class="catalog-notice">${escapeHtml(catalogError)} <button class="text-button" data-catalog-retry>Повторить</button></p>`
        : catalogLoading
          ? '<p class="catalog-notice">Загружаем каталог приложений…</p>'
          : `<div class="app-grid app-grid--featured">${apps.map((app) => appCard(app, { installed: installedApps.has(app.id), downloaded: downloads.some((item) => item.id === app.id), installing: installingApps.has(app.id), installStatus: installStatuses.get(app.id), compact: true, language })).join("")}</div>`}
    </section>

    <section class="hub-overview">
      <button class="overview-card" data-page="library"><span class="overview-icon overview-icon--library">${icon("books")}</span><span><strong>Библиотека</strong><small>${installedCount ? `${installedCount} в коллекции` : "Ваша коллекция приложений"}</small></span>${icon("chevron")}</button>
      <button class="overview-card" data-page="downloads"><span class="overview-icon overview-icon--downloads">${icon("download")}</span><span><strong>Загрузки</strong><small>${downloadCount ? `${downloadCount} загружено` : "История загрузок"}</small></span>${icon("chevron")}</button>
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
    ? pluralize(count, "загрузка", "загрузки", "загрузок")
    : pluralize(count, "приложение", "приложения", "приложений");

  const catalogStatus = page === "apps" && catalogLoading
    ? '<div class="empty-state"><h2>Загружаем каталог</h2><p>Получаем список приложений из Supabase.</p></div>'
    : page === "apps" && catalogError
      ? `<div class="empty-state"><h2>Не удалось загрузить каталог</h2><p>${escapeHtml(catalogError)}</p><button class="button button--primary" data-catalog-retry>Повторить</button></div>`
      : matchingApps.length
        ? `<div class="app-grid">${matchingApps.map((app) => appCard(app, { installed: installed || installedApps.has(app.id), downloaded: page === "downloads", installing: installingApps.has(app.id), installStatus: installStatuses.get(app.id), uninstalling: uninstallingApps.has(app.id), compact: false, language })).join("")}</div>`
        : `<div class="empty-state"><span class="empty-state__icon">${icon(page === "apps" ? "grid" : page === "downloads" ? "download" : "books")}</span><h2>${page === "apps" && query ? "Ничего не найдено" : page === "apps" ? "Нет доступных приложений" : page === "downloads" ? "Загрузок пока нет" : "В библиотеке пока пусто"}</h2><p>${page === "apps" ? query ? "Попробуйте изменить поисковый запрос." : "В каталоге пока нет доступных приложений." : page === "downloads" ? "Загруженные приложения будут перечислены в этой истории." : "Установите приложение из каталога, чтобы оно появилось здесь."}</p>${page !== "apps" ? `<button class="button button--primary" data-page="apps">Перейти к приложениям ${icon("arrow")}</button>` : ""}</div>`;

  return `
    <section class="page-intro"><span class="eyebrow">${copy.eyebrow}</span><h1>${copy.title}</h1><p>${copy.description}</p></section>
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
        <nav class="sidebar__nav" aria-label="Главное меню">
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
          <div class="breadcrumbs"><span>Экосистема Limon</span>${icon("chevron")}<strong>${currentTitle}</strong></div>
          <div class="topbar__actions">
            <label class="search-box">${icon("search")}<input id="catalog-search" type="search" placeholder="${t(language, "search")}" value="${escapeAttribute(query)}" aria-label="${t(language, "search")}" /><kbd>Ctrl K</kbd></label>
            <button class="profile-button" data-auth-action="sign-out" aria-label="Выйти из аккаунта ${escapeHtml(user.name)}">
              <span class="profile-avatar">${escapeHtml(user.initials)}</span>
              <span class="profile-copy"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></span>
              <span class="profile-sign-out">${t(language, "signOut")}</span>
            </button>
          </div>
        </header>
        ${updateAvailableVersion
          ? `<section class="update-banner" role="status"><span>Доступно обновление Limon Hub <strong>v${escapeHtml(updateAvailableVersion)}</strong></span><button class="button button--primary" data-update-action="install" ${updateInstalling ? "disabled" : ""}>${updateInstalling ? "Устанавливаем…" : "Установить и перезапустить"}</button></section>`
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
      <section class="auth-brand-panel">
        <a class="brand auth-brand" href="#" aria-label="Limon Hub">
          <img class="brand__logo" src="/assets/HubLogo.png" alt="" />
          <span class="brand__copy"><strong>Limon Hub</strong><small>Digital Technologies</small></span>
        </a>
        <div class="auth-brand-panel__copy">
          <span class="eyebrow eyebrow--light">${language === "en" ? "UNIFIED ECOSYSTEM" : "ЕДИНАЯ ЭКОСИСТЕМА"}</span>
          <h1>${language === "en" ? "Everything your team creates." : "Всё, что создаёт ваша команда."}<br /><span>${language === "en" ? "In one workspace." : "В одном пространстве."}</span></h1>
          <p>${language === "en" ? "Sign in to Limon Digital Technologies to access ecosystem products and services." : "Войдите в аккаунт Limon Digital Technologies и продолжите работу с продуктами и сервисами экосистемы."}</p>
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
          <span class="eyebrow">${language === "en" ? "LIMON ACCOUNT" : "АККАУНТ LIMON"}</span>
          <h2>${isSignUp ? (language === "en" ? "Create account" : "Создайте аккаунт") : (language === "en" ? "Welcome back" : "С возвращением")}</h2>
          <p class="auth-subtitle">${isSignUp ? (language === "en" ? "Join the Limon ecosystem." : "Присоединяйтесь к экосистеме Limon.") : (language === "en" ? "Sign in to continue." : "Войдите, чтобы продолжить работу.")}</p>
          <div class="auth-mode-switch" role="tablist" aria-label="${language === "en" ? "Account mode" : "Режим аккаунта"}">
            <button class="auth-mode ${!isSignUp ? "is-selected" : ""}" type="button" role="tab" aria-selected="${!isSignUp}" data-auth-mode="sign-in">${language === "en" ? "Sign in" : "Войти"}</button>
            <button class="auth-mode ${isSignUp ? "is-selected" : ""}" type="button" role="tab" aria-selected="${isSignUp}" data-auth-mode="sign-up">${language === "en" ? "Register" : "Регистрация"}</button>
          </div>
          ${configurationNotice}
          ${notice}
          <form id="auth-form" class="auth-form">
            ${isSignUp ? `<label class="auth-field"><span>${language === "en" ? "Name" : "Имя"}</span><input name="name" type="text" autocomplete="name" placeholder="${language === "en" ? "How should we address you" : "Как к вам обращаться"}" maxlength="80" required ${disabled ? "disabled" : ""} /></label>` : ""}
            <label class="auth-field"><span>Email</span><input name="email" type="email" autocomplete="email" placeholder="name@example.com" maxlength="254" required ${disabled ? "disabled" : ""} /></label>
            <label class="auth-field"><span>${language === "en" ? "Password" : "Пароль"}</span><input name="password" type="password" autocomplete="${isSignUp ? "new-password" : "current-password"}" placeholder="${isSignUp ? (language === "en" ? "At least 6 characters" : "Не менее 6 символов") : (language === "en" ? "Enter password" : "Введите пароль")}" minlength="6" required ${disabled ? "disabled" : ""} /></label>
            <button class="button button--primary auth-submit" type="submit" ${disabled ? "disabled" : ""}>${pending ? (language === "en" ? "Please wait…" : "Подождите…") : isSignUp ? (language === "en" ? "Create account" : "Создать аккаунт") : (language === "en" ? "Sign in" : "Войти")} ${icon("arrow")}</button>
          </form>
          <p class="auth-privacy">${language === "en" ? "Your account is protected by Supabase Auth." : "Ваша учётная запись защищена Supabase Auth."}</p>
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
