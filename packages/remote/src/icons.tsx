import type { JSX } from "preact";

/** Inline 24px icons. Stroke icons inherit currentColor; media glyphs are filled with rounded joins. */
const base = { viewBox: "0 0 24 24", "aria-hidden": true, focusable: "false" } as const;

export const IconBack = () => (
  <svg {...base}>
    <path d="M14.5 6 8.5 12l6 6" />
  </svg>
);
export const IconHome = () => (
  <svg {...base}>
    <path d="M4.5 11 12 4.5 19.5 11M6.5 9.8V19h11V9.8" />
  </svg>
);
export const IconPrev = () => (
  <svg {...base} class="fill">
    <path d="M6.5 6v12" class="s" />
    <path d="M18 7.2v9.6a.8.8 0 0 1-1.25.66L9.6 12.66a.8.8 0 0 1 0-1.32l7.15-4.8A.8.8 0 0 1 18 7.2Z" />
  </svg>
);
export const IconNext = () => (
  <svg {...base} class="fill">
    <path d="M17.5 6v12" class="s" />
    <path d="M6 7.2v9.6a.8.8 0 0 0 1.25.66l7.15-4.8a.8.8 0 0 0 0-1.32l-7.15-4.8A.8.8 0 0 0 6 7.2Z" />
  </svg>
);
export const IconPlayPause = () => (
  <svg {...base} class="fill">
    <path d="M3.6 7.1v9.8a.9.9 0 0 0 1.38.76l7.2-4.9a.9.9 0 0 0 0-1.52l-7.2-4.9a.9.9 0 0 0-1.38.76Z" />
    <rect x="14.6" y="6.2" width="2.5" height="11.6" rx="1" />
    <rect x="18.8" y="6.2" width="2.5" height="11.6" rx="1" />
  </svg>
);
const speaker = <path d="M4 9.8h3l4-3.4v11.2l-4-3.4H4a.7.7 0 0 1-.7-.7v-3a.7.7 0 0 1 .7-.7Z" class="f" />;
export const IconVolDown = () => (
  <svg {...base}>
    {speaker}
    <path d="M15 12h5" />
  </svg>
);
export const IconVolUp = () => (
  <svg {...base}>
    {speaker}
    <path d="M15 12h5M17.5 9.5v5" />
  </svg>
);
export const IconMute = () => (
  <svg {...base}>
    {speaker}
    <path d="m15.5 9.5 4.5 5M20 9.5l-4.5 5" />
  </svg>
);

export const IconRemote = () => (
  <svg {...base}>
    <rect x="7" y="3.5" width="10" height="17" rx="3.2" />
    <circle cx="12" cy="10" r="1.6" />
    <path d="M10.2 15.8h3.6" />
  </svg>
);
export const IconTouchpad = () => (
  <svg {...base}>
    <rect x="4" y="5.5" width="16" height="13" rx="3.5" />
    <path d="M9 15.5h6" />
  </svg>
);
export const IconApps = () => (
  <svg {...base}>
    <rect x="4.5" y="4.5" width="6" height="6" rx="1.8" />
    <rect x="13.5" y="4.5" width="6" height="6" rx="1.8" />
    <rect x="4.5" y="13.5" width="6" height="6" rx="1.8" />
    <rect x="13.5" y="13.5" width="6" height="6" rx="1.8" />
  </svg>
);

export const IconBackspace = () => (
  <svg {...base}>
    <path d="M9.2 6.5h9a1.8 1.8 0 0 1 1.8 1.8v7.4a1.8 1.8 0 0 1-1.8 1.8h-9L3.8 12l5.4-5.5Z" />
    <path d="m12.6 10 4 4m0-4-4 4" />
  </svg>
);
export const IconSpace = () => (
  <svg {...base}>
    <path d="M5 11v4.2h14V11" />
  </svg>
);
export const IconEnter = () => (
  <svg {...base}>
    <path d="M18.5 6.5v5.2a2 2 0 0 1-2 2H6.3m0 0 3.5-3.5m-3.5 3.5 3.5 3.5" />
  </svg>
);
export const IconTab = () => (
  <svg {...base}>
    <path d="M4 12h13m0 0-4-4m4 4-4 4M20 7v10" />
  </svg>
);
export const IconKeyboard = () => (
  <svg {...base}>
    <rect x="3.5" y="6.5" width="17" height="11" rx="3" />
    <path d="M7.5 10.5h.01M11 10.5h.01M14.5 10.5h.01M17 10.5h.01M8 14h8" />
  </svg>
);

export type IconComponent = () => JSX.Element;
