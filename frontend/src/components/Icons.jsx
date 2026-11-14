import React from 'react';

const paths = {
  arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  upRight: <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  close: <><path d="M5 5 19 19" /><path d="M19 5 5 19" /></>,
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9" /><path d="M9 21v-7h6v7" /></>,
  book: <><path d="M12 6c-2-2-5-3-9-2v15c4-1 7 0 9 2 2-2 5-3 9-2V4c-4-1-7 0-9 2Z" /><path d="M12 6v15" /></>,
  draft: <><path d="m4 19 15-15 2 2-15 15H4v-2Z" /><path d="m14 9 3 3" /><path d="M4 13v-9h9" /></>,
  hardhat: <><path d="M3 16h18v3H3z" /><path d="M5 16V11a7 7 0 0 1 14 0v5" /><path d="M12 4v7" /><path d="M8 20h8" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2" /><path d="M17 5a3 3 0 0 1 0 6" /><path d="M17 15a5 5 0 0 1 4 5v1" /></>,
  blueprint: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 3v18M3 8h18M13 8v8h8" /><path d="M8 16h5" /></>,
  spark: <><path d="m12 2 1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2Z" /><path d="m19 18 .5 1.5L21 20l-1.5.5L19 22l-.5-1.5L17 20l1.5-.5L19 18Z" /></>,
  note: <><path d="M7 3h10l4 4v14H3V3h4Z" /><path d="M17 3v5h4" /><path d="M7 12h10M7 16h7" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
  filter: <><path d="M4 7h16M7 12h10M10 17h4" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-3l2.5 6M4 12l2.5 6a7 7 0 0 0 12-3" /></>,
  alert: <><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5M12 18h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  shield: <><path d="m12 2 8 4v6c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-4Z"/><path d="m9 12 2 2 4-4"/></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  folder: <><path d="M3 7V5h7l2 3h9v12H3V7Z" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7 .3l2-2a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7-.3l-2 2a5 5 0 0 0 7 7l1.5-1.5" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-3 5-5 3 3-5 5-3Z" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
};

export function Icon({ name, size = 20, strokeWidth = 1.8, className = '', ...rest }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {paths[name] || paths.info}
    </svg>
  );
}
