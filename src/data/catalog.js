export const navigation = [
  { id: "home", label: "Главная", icon: "home", section: "main" },
  { id: "apps", label: "Приложения", icon: "grid", section: "main" },
  { id: "downloads", label: "Загрузки", icon: "download", section: "library" },
  { id: "library", label: "Библиотека", icon: "books", section: "library" },
];

export const apps = [
  {
    id: "calculator",
    name: "Limon Calculator",
    category: "Утилиты",
    description: "Отдельное Windows-приложение для ежедневных вычислений.",
    icon: "LC",
    color: "blue",
    repository: "Limon-Digital-Technologies/LimonDT-hub",
    releaseApi: "https://api.github.com/repos/Limon-Digital-Technologies/LimonDT-hub/releases?per_page=100",
    releaseTagPrefix: "calculator-v",
    assetName: "Limon-Calculator-windows-x64.msi",
    checksumName: "Limon-Calculator-windows-x64.msi.sha256",
    fileName: "Limon-Calculator-windows-x64.msi",
    version: "1.0.0",
  },
];

export const pageCopy = {
  apps: {
    eyebrow: "ПРОДУКТЫ LIMON",
    title: "Приложения",
    description: "Приложения экосистемы Limon Digital Technologies.",
  },
  downloads: {
    eyebrow: "ИСТОРИЯ ЗАГРУЗОК",
    title: "Загрузки",
    description: "Приложения, загруженные на это устройство.",
  },
  library: {
    eyebrow: "ВАША КОЛЛЕКЦИЯ",
    title: "Библиотека",
    description: "Загруженные приложения, сохранённые в вашей коллекции.",
  },
};
