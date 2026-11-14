// Original inline SVG controls. Icons supplement the visible labels.
const paths={
  landscape:'m3 18 5-8 4 5 3-4 6 7H3ZM15 5h.01',
  map:'m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15M15 6v15',
  radar:'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l8-8M12 11v2',
  arrival:'M4 16h16M7 12l5 4 5-4M12 3v12M4 21h16',
  duration:'M7 3h10M7 21h10M8 3v4l8 10v4M16 3v4L8 17v4',
  recession:'M4 8h16M7 16l5-4 5 4M12 12v9M4 3h16',
  calendar:'M7 3v4M17 3v4M4 10h16M4 5h16v16H4V5ZM8 14h2M14 14h2',
  tour:'m9 5 11 7-11 7V5Z',
  record:'M4 6h12v12H4V6Zm12 4 5-3v10l-5-3',
  info:'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 18h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  copy:'M9 9h11v12H9V9ZM15 9V3H3v12h6',
  sound:'m4 10 5-4v12l-5-4H2v-4h2ZM13 8a6 6 0 0 1 0 8M17 4a11 11 0 0 1 0 16',
  light:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1',
  menu:'M4 7h16M4 12h16M4 17h16',
};
export function icon(name){return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name]||paths.info}"/></svg>`;}
