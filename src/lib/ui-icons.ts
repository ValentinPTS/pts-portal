// Redesign R0: the portal's icons — simple line drawings on a 24 × 24 grid, drawn by components/ui/Icon. Data only
// (no markup strings), so an icon can never carry anything but its own shapes.
type Shape =
  | { t: "path"; d: string }
  | { t: "circle"; cx: number; cy: number; r: number }
  | { t: "rect"; x: number; y: number; w: number; h: number; rx?: number };

export const ICONS = {
  check: [{ t: "path", d: "M5 12l5 5L20 7" }],
  pencil: [{ t: "path", d: "M4 20h4L19 9l-4-4L4 16z" }],
  flask: [{ t: "path", d: "M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3" }],
  doc: [{ t: "path", d: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" }, { t: "path", d: "M14 3v5h5" }],
  message: [{ t: "path", d: "M4 5h16v11H8l-4 4z" }],
  box: [{ t: "path", d: "M3 7l9-4 9 4v10l-9 4-9-4z" }, { t: "path", d: "M3 7l9 4 9-4M12 11v10" }],
  chart: [{ t: "path", d: "M4 20V10M10 20V4M16 20v-7M22 20H2" }],
  award: [{ t: "circle", cx: 12, cy: 9, r: 5 }, { t: "path", d: "M8.5 13 7 21l5-3 5 3-1.5-8" }],
  calendar: [{ t: "rect", x: 3, y: 5, w: 18, h: 16, rx: 2 }, { t: "path", d: "M3 10h18M8 3v4M16 3v4" }],
  help: [{ t: "circle", cx: 12, cy: 12, r: 9 }, { t: "path", d: "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14" }, { t: "path", d: "M12 17.5v.01" }],
  info: [{ t: "circle", cx: 12, cy: 12, r: 9 }, { t: "path", d: "M12 11v6M12 7.5v.01" }],
  arrowRight: [{ t: "path", d: "M5 12h14M13 6l6 6-6 6" }],
  arrowLeft: [{ t: "path", d: "M19 12H5M11 6l-6 6 6 6" }],
  clock: [{ t: "circle", cx: 12, cy: 12, r: 9 }, { t: "path", d: "M12 7v5l3 3" }],
  user: [{ t: "circle", cx: 12, cy: 8, r: 4 }, { t: "path", d: "M4 21c1-4 4-6 8-6s7 2 8 6" }],
  home: [{ t: "path", d: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" }],
  bell: [{ t: "path", d: "M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" }, { t: "path", d: "M10 20a2 2 0 0 0 4 0" }],
  building: [{ t: "path", d: "M3 21V8l9-5 9 5v13" }, { t: "path", d: "M9 21v-6h6v6" }],
  people: [{ t: "circle", cx: 9, cy: 8, r: 3.5 }, { t: "path", d: "M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5" }, { t: "path", d: "M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.8.7 3 2.5 3.5 5.2" }],
  search: [{ t: "circle", cx: 11, cy: 11, r: 7 }, { t: "path", d: "M20 20l-4-4" }],
  truck: [{ t: "path", d: "M3 6h11v10H3zM14 9h4l3 3v4h-7" }, { t: "circle", cx: 7, cy: 18, r: 2 }, { t: "circle", cx: 17, cy: 18, r: 2 }],
  receipt: [{ t: "path", d: "M6 3h12v18l-3-2-3 2-3-2-3 2z" }, { t: "path", d: "M9 8h6M9 12h6M9 16h3" }],
  list: [{ t: "path", d: "M9 6h11M9 12h11M9 18h11" }, { t: "path", d: "M4 6h.01M4 12h.01M4 18h.01" }],
  globe: [{ t: "circle", cx: 12, cy: 12, r: 9 }, { t: "path", d: "M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3" }],
  bookmark: [{ t: "path", d: "M6 3h12v18l-6-4-6 4z" }],
  palette: [{ t: "path", d: "M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.3-1.1-1.8-1.1-2.9 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.3-4-7.8-9-7.8z" }, { t: "circle", cx: 7.5, cy: 11, r: 1 }, { t: "circle", cx: 10, cy: 7, r: 1 }, { t: "circle", cx: 15, cy: 7.5, r: 1 }],
  history: [{ t: "path", d: "M3 12a9 9 0 1 0 3-6.7L3 8" }, { t: "path", d: "M3 3v5h5M12 8v4l3 2" }],
  shield: [{ t: "path", d: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" }, { t: "path", d: "M8.5 12l2.5 2.5L16 9.5" }],
  gear: [{ t: "circle", cx: 12, cy: 12, r: 3 }, { t: "path", d: "M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" }],
  plus: [{ t: "path", d: "M12 5v14M5 12h14" }],
  logout: [{ t: "path", d: "M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" }, { t: "path", d: "M16 17l5-5-5-5M21 12H9" }],
  phone: [{ t: "path", d: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" }],
  mail: [{ t: "rect", x: 3, y: 5, w: 18, h: 14, rx: 2 }, { t: "path", d: "M3 7l9 6 9-6" }],
  dot: [{ t: "circle", cx: 12, cy: 12, r: 3 }],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;
export type { Shape as IconShape };
