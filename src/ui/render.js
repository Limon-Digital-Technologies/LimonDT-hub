import { apps, navigation, pageCopy } from "../data/catalog.js";
import { icon } from "./icons.js";

function navButton(item, activePage, downloadCount) {
  return `
    <button class="nav-item ${activePage === item.id ? "is-active" : ""}" data-page="${item.id}" aria-current="${activePage === item.id ? "page" : "false"}">
      <span class="nav-item__icon">${icon(item.icon)}</span>
      <span class="nav-item__label">${item.label}</span>
      ${item.id === "downloads" && downloadCount ? `<span class="nav-item__count">${downloadCount}</span>` : ""}
    </button>`;
}

function appCard(app, { installed = false, downloaded = false, downloading = false, compact = false } = {}) {
  const action = installed ? "Открыть в хабе" : downloading ? "Скачиваем…" : "Скачать";
  const actionMarkup = installed
    ? `<button class="button button--primary app-action" data-app-action="${app.id}" data-action="open">${action} ${icon("arrow")}</button>`
    : `<button class="button button--primary app-action" data-app-action="${app.id}" data-action="download" ${downloading ? "disabled aria-busy=\"true\"" : ""}>${downloading ? "" : icon("download")} ${action}</button>`;

  return `
    <article class="app-card ${compact ? "app-card--compact" : ""}">
      <div class="app-card__top">
        <span class="app-icon app-icon--${app.color} ${compact ? "app-icon--small" : ""}">${app.icon}</span>
        <span class="app-version">v${app.version}</span>
      </div>
      <div class="app-card__copy">
        <span class="app-card__category">${app.category}</span>
        <h3>${app.name}</h3>
        <p>${app.description}</p>
      </div>
      <div class="app-card__actions">
        ${actionMarkup}
        ${installed ? `<button class="icon-button remove-app-button" data-remove-app="${app.id}" aria-label="Удалить ${app.name} из библиотеки" title="Удалить из библиотеки">${icon("close")}</button>` : ""}
        ${downloaded ? '<span class="download-status">Загружено</span>' : ""}
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

function homePage({ installedApps, downloads, downloadingApps }) {
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
      <div class="app-grid app-grid--featured">${apps.map((app) => appCard(app, { installed: installedApps.has(app.id), downloaded: downloads.some((item) => item.id === app.id), downloading: downloadingApps.has(app.id), compact: true })).join("")}</div>
    </section>

    <section class="hub-overview">
      <button class="overview-card" data-page="library"><span class="overview-icon overview-icon--library">${icon("books")}</span><span><strong>Библиотека</strong><small>${installedCount ? `${installedCount} в коллекции` : "Ваша коллекция приложений"}</small></span>${icon("chevron")}</button>
      <button class="overview-card" data-page="downloads"><span class="overview-icon overview-icon--downloads">${icon("download")}</span><span><strong>Загрузки</strong><small>${downloadCount ? `${downloadCount} загружено` : "История загрузок"}</small></span>${icon("chevron")}</button>
    </section>`;
}

function calculatorPage() {
  const keys = [
    { label: "AC", action: "clear", kind: "utility" },
    { label: "±", action: "sign", kind: "utility" },
    { label: "%", action: "percent", kind: "utility" },
    { label: "÷", action: "operator", value: "/", kind: "operator" },
    { label: "7", action: "digit" }, { label: "8", action: "digit" }, { label: "9", action: "digit" },
    { label: "×", action: "operator", value: "*", kind: "operator" },
    { label: "4", action: "digit" }, { label: "5", action: "digit" }, { label: "6", action: "digit" },
    { label: "−", action: "operator", value: "-", kind: "operator" },
    { label: "1", action: "digit" }, { label: "2", action: "digit" }, { label: "3", action: "digit" },
    { label: "+", action: "operator", value: "+", kind: "operator" },
    { label: "0", action: "digit", kind: "calculator-key--zero" },
    { label: ".", action: "decimal" }, { label: "=", action: "equals", kind: "operator" },
  ];

  return `
    <section class="page-intro calculator-intro"><button class="back-button" data-page="library">${icon("arrow")} Библиотека</button><span class="eyebrow">ПРИЛОЖЕНИЕ LIMON</span><h1>Limon Calculator</h1><p>Быстрые вычисления в экосистеме Limon.</p></section>
    <section class="calculator" aria-label="Калькулятор">
      <div class="calculator-display" aria-live="polite">
        <div class="calculator-expression" data-calculator-expression></div>
        <output class="calculator-value" data-calculator-display>0</output>
      </div>
      <div class="calculator-keys">
        ${keys.map((key) => {
          const value = key.value ?? (key.action === "digit" ? key.label : null);
          return `<button class="calculator-key ${key.kind || ""}" data-calculator-action="${key.action}" ${value !== null ? `data-value="${value}"` : ""} aria-label="${key.action === "operator" ? `Операция ${key.label}` : key.label}">${key.label}</button>`;
        }).join("")}
      </div>
      <p class="calculator-hint">Можно также вводить выражения с клавиатуры.</p>
    </section>`;
}

function catalogPage(page, { installedApps, downloads, downloadingApps, query }) {
  const copy = pageCopy[page];
  if (page === "calculator") return calculatorPage();

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

  return `
    <section class="page-intro"><span class="eyebrow">${copy.eyebrow}</span><h1>${copy.title}</h1><p>${copy.description}</p></section>
    <div class="catalog-toolbar"><span>${count} ${word}</span></div>
    ${matchingApps.length
      ? `<div class="app-grid">${matchingApps.map((app) => appCard(app, { installed: installed || installedApps.has(app.id), downloaded: page === "downloads", downloading: downloadingApps.has(app.id), compact: false })).join("")}</div>`
      : `<div class="empty-state"><span class="empty-state__icon">${icon(page === "apps" ? "grid" : page === "downloads" ? "download" : "books")}</span><h2>${page === "apps" && query ? "Ничего не найдено" : page === "apps" ? "Нет доступных приложений" : page === "downloads" ? "Загрузок пока нет" : "В библиотеке пока пусто"}</h2><p>${page === "apps" ? query ? "Попробуйте изменить поисковый запрос." : "В каталоге пока нет доступных приложений." : page === "downloads" ? "Загруженные приложения будут перечислены в этой истории." : "Скачайте приложение, чтобы добавить его в библиотеку."}</p>${page !== "apps" ? `<button class="button button--primary" data-page="apps">Перейти к приложениям ${icon("arrow")}</button>` : ""}</div>`}`;
}

function settingsPage({ updaterStatus, updaterChecking, updateAvailableVersion, updateInstalling, version }) {
  return `
    <section class="page-intro"><span class="eyebrow">ПЕРСОНАЛИЗАЦИЯ</span><h1>Настройки</h1><p>Настройте хаб так, чтобы он работал именно для вас.</p></section>
    <section class="settings-panel">
      <div class="settings-row"><div><strong>Тема оформления</strong><p>Светлая тема — комфортно и знакомо.</p></div><span class="settings-value">Светлая</span></div>
      <div class="settings-row"><div><strong>Анимации интерфейса</strong><p>Плавные переходы и декоративные эффекты.</p></div><button class="switch is-on" data-setting="animations" role="switch" aria-checked="true" aria-label="Анимации интерфейса"><span></span></button></div>
      <div class="settings-row"><div><strong>Компактный режим</strong><p>Больше приложений на экране.</p></div><button class="switch" data-setting="compact" role="switch" aria-checked="false" aria-label="Компактный режим"><span></span></button></div>
      <div class="settings-row settings-row--updates">
        <div><strong>Обновление Limon Hub</strong><p data-updater-status>${escapeHtml(updaterStatus)}</p></div>
        <div class="settings-row__actions">
          ${updateAvailableVersion
            ? `<button class="button button--primary" data-update-action="install" ${updateInstalling ? "disabled" : ""}>${updateInstalling ? "Устанавливаем…" : `Установить v${escapeHtml(updateAvailableVersion)}`}</button>`
            : ""}
          <button class="button button--secondary" data-update-action="check" ${updaterChecking || updateInstalling ? "disabled" : ""}>${updaterChecking ? "Проверяем…" : "Проверить"}</button>
        </div>
      </div>
    </section>
    <div class="settings-footer"><img src="/assets/HubLogo.png" alt="" /><span>Limon Digital Tech. Hub <small>Версия ${escapeHtml(version)}</small></span></div>`;
}

export function renderApp({
  activePage,
  query = "",
  downloads = [],
  installedApps = new Set(),
  downloadingApps = new Set(),
  settings,
  user,
  updaterStatus,
  updaterChecking,
  updateAvailableVersion,
  updateInstalling,
  version,
}) {
  const page = activePage === "settings"
    ? settingsPage({ updaterStatus, updaterChecking, updateAvailableVersion, updateInstalling, version })
    : activePage === "home"
      ? homePage({ installedApps, downloads, downloadingApps })
      : catalogPage(activePage, { installedApps, downloads, downloadingApps, query });
  const currentTitle = activePage === "settings"
    ? "Настройки"
    : activePage === "home"
      ? "Главная"
      : pageCopy[activePage]?.title ?? "Калькулятор";

  return `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#" data-page="home" aria-label="Limon Hub — главная">
          <img class="brand__logo" src="/assets/HubLogo.png" alt="" />
          <span class="brand__copy"><strong>Limon Hub</strong><small>Digital Technologies</small></span>
        </a>
        <div class="sidebar__divider"></div>
        <nav class="sidebar__nav" aria-label="Главное меню">
          <span class="nav-caption">ЭКОСИСТЕМА</span>
          ${navigation.filter((item) => item.section === "main").map((item) => navButton(item, activePage, downloads.length)).join("")}
          <span class="nav-caption nav-caption--library">ВАША КОЛЛЕКЦИЯ</span>
          ${navigation.filter((item) => item.section === "library").map((item) => navButton(item, activePage, downloads.length)).join("")}
        </nav>
        <div class="sidebar__bottom">
          ${navButton({ id: "settings", label: "Настройки", icon: "settings" }, activePage, downloads.length)}
          <div class="sidebar__version">Создано с заботой <span>·</span> v${escapeHtml(version)}</div>
        </div>
      </aside>

      <main class="workspace">
        <header class="topbar">
          <div class="breadcrumbs"><span>Экосистема Limon</span>${icon("chevron")}<strong>${currentTitle}</strong></div>
          <div class="topbar__actions">
            <label class="search-box">${icon("search")}<input id="catalog-search" type="search" placeholder="Найти приложение" value="${escapeAttribute(query)}" aria-label="Найти приложение" /><kbd>Ctrl K</kbd></label>
            <button class="profile-button" data-auth-action="sign-out" aria-label="Выйти из аккаунта ${escapeHtml(user.name)}">
              <span class="profile-avatar">${escapeHtml(user.initials)}</span>
              <span class="profile-copy"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></span>
              <span class="profile-sign-out">Выйти</span>
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

export function renderAuth({ mode, pending, message, configError }) {
  const isSignUp = mode === "sign-up";
  const disabled = pending || configError;
  const notice = message
    ? `<div class="auth-notice ${message.type === "error" ? "auth-notice--error" : "auth-notice--success"}" role="${message.type === "error" ? "alert" : "status"}">${escapeHtml(message.text)}</div>`
    : "";
  const configurationNotice = configError
    ? '<div class="auth-notice auth-notice--error" role="alert">Supabase не настроен. Проверьте VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в файле .env, затем перезапустите приложение.</div>'
    : "";

  return `
    <main class="auth-shell">
      <section class="auth-brand-panel">
        <a class="brand auth-brand" href="#" aria-label="Limon Hub">
          <img class="brand__logo" src="/assets/HubLogo.png" alt="" />
          <span class="brand__copy"><strong>Limon Hub</strong><small>Digital Technologies</small></span>
        </a>
        <div class="auth-brand-panel__copy">
          <span class="eyebrow eyebrow--light">ЕДИНАЯ ЭКОСИСТЕМА</span>
          <h1>Всё, что создаёт ваша команда.<br /><span>В одном пространстве.</span></h1>
          <p>Войдите в аккаунт Limon Digital Technologies и продолжите работу с продуктами и сервисами экосистемы.</p>
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
          <span class="eyebrow">АККАУНТ LIMON</span>
          <h2>${isSignUp ? "Создайте аккаунт" : "С возвращением"}</h2>
          <p class="auth-subtitle">${isSignUp ? "Присоединяйтесь к экосистеме Limon." : "Войдите, чтобы продолжить работу."}</p>
          <div class="auth-mode-switch" role="tablist" aria-label="Режим аккаунта">
            <button class="auth-mode ${!isSignUp ? "is-selected" : ""}" type="button" role="tab" aria-selected="${!isSignUp}" data-auth-mode="sign-in">Войти</button>
            <button class="auth-mode ${isSignUp ? "is-selected" : ""}" type="button" role="tab" aria-selected="${isSignUp}" data-auth-mode="sign-up">Регистрация</button>
          </div>
          ${configurationNotice}
          ${notice}
          <form id="auth-form" class="auth-form">
            ${isSignUp ? `<label class="auth-field"><span>Имя</span><input name="name" type="text" autocomplete="name" placeholder="Как к вам обращаться" maxlength="80" required ${disabled ? "disabled" : ""} /></label>` : ""}
            <label class="auth-field"><span>Email</span><input name="email" type="email" autocomplete="email" placeholder="name@example.com" maxlength="254" required ${disabled ? "disabled" : ""} /></label>
            <label class="auth-field"><span>Пароль</span><input name="password" type="password" autocomplete="${isSignUp ? "new-password" : "current-password"}" placeholder="${isSignUp ? "Не менее 6 символов" : "Введите пароль"}" minlength="6" required ${disabled ? "disabled" : ""} /></label>
            <button class="button button--primary auth-submit" type="submit" ${disabled ? "disabled" : ""}>${pending ? "Подождите…" : isSignUp ? "Создать аккаунт" : "Войти"} ${icon("arrow")}</button>
          </form>
          <p class="auth-privacy">Ваша учётная запись защищена Supabase Auth.</p>
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
