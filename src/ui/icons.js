const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 17v3h14v-3"/>',
  books: '<path d="M4 4h4v16H4zM10 3h4v17h-4zM16.5 4l3.5-1 3 15-3.5 1z"/>',
  settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1 1.1.9-1.5 2.6-1.4-.5a7.8 7.8 0 0 1-1.5.9l-.2 1.5h-3l-.2-1.5a7.8 7.8 0 0 1-1.5-.9l-1.4.5-1.5-2.6 1.1-.9a7 7 0 0 1 0-1.8l-1.1-.9 1.5-2.6 1.4.5a7.8 7.8 0 0 1 1.5-.9l.2-1.5h3l.2 1.5a7.8 7.8 0 0 1 1.5.9l1.4-.5 1.5 2.6-1.1.9a7 7 0 0 1-.1 1.7Z"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
};

export function icon(name, className = "") {
  const content = paths[name];
  if (!content) throw new Error(`Unknown icon: ${name}`);
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
}
