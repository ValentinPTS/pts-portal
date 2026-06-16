import type { Scheme, Lang } from "../lib/types";
import type { Skin, SchemeType } from "./types";
import { DOC_CSS, esc, pick } from "../lib/doc-css";

// ─────────────────────────────────────────────────────────────────────────────
// Data-driven (user-created) skins.
//
// A built-in skin is hand-written code (cover()/footer()/css). A *custom* skin is
// pure DATA — colours, fonts, logo, an ordered list of cover elements (each with
// alignment + size), a header-band option and a density — that this module COMPILES
// into a Skin at render time. The data is stored in the DB (lib/custom-skins.ts)
// and authored in the visual editor (components/SkinEditor).
//
// SECURITY: every value here ends up inside a stylesheet or an HTML attribute, so
// the data is treated as untrusted. `sanitizeSkinData()` is the server-side gate
// (hex-only colours, allow-listed fonts, fixed element keys, enum sizes/density/band,
// restricted logo URL), and the pure render helpers are *also* defensive
// (safeColor/validFont/safeLogo) so a bad value can never break out of the
// CSS/attribute even in the live preview. This module imports only doc-css.ts (no
// node:async_hooks) so it is safe to bundle for the browser preview.
// ─────────────────────────────────────────────────────────────────────────────

export type SkinScope = "T" | "C" | "both";
export type SkinBase = "classic" | "modern" | "minimal" | "blank" | "banded" | "editorial" | "bold";
export type Align = "left" | "center" | "right";
export type ElSize = "s" | "m" | "l";
export type Density = "compact" | "normal" | "airy";
export type BandColor = "primary" | "accent" | "heading";
export type CoverElKey =
  | "logo" | "embroidery" | "title" | "standard" | "number" | "schemeTitle" | "image";

export interface CoverEl {
  key: CoverElKey;
  shown: boolean;
  align: Align;
  size: ElSize; // text elements → font scale; logo/image → dimension scale
}
export interface SkinColors {
  primary: string;  // accents, table headers, calibration bars
  accent: string;   // section rules + scheme number
  heading: string;  // document/section heading colour
  bg: string;       // page background
}
export interface SkinFonts {
  heading: string;  // a FONTS id (heading-capable)
  body: string;     // a FONTS id (body-capable)
}
export interface CoverBand {
  on: boolean;
  color: BandColor; // which palette colour the band uses
}
export interface CustomSkinData {
  id: string;
  name: string;
  scope: SkinScope;
  base: SkinBase;
  colors: SkinColors;
  fonts: SkinFonts;
  logo: string;       // "default" | "/brand/<file>" | "https://…"
  density: Density;
  band: CoverBand;
  elements: CoverEl[];
}

// ── Font allow-list (only fonts we actually load from Google Fonts) ──────────
export interface FontDef {
  id: string;        // display name + CSS family head
  css: string;       // full font-family stack
  g: string;         // Google Fonts css2 `family=` spec
  kind: "heading" | "body" | "both";
}
export const FONTS: FontDef[] = [
  { id: "Sofia Sans Condensed", css: "'Sofia Sans Condensed','Segoe UI',Arial,sans-serif", g: "Sofia+Sans+Condensed:wght@400;600;700;800", kind: "heading" },
  { id: "Montserrat", css: "'Montserrat',Arial,sans-serif", g: "Montserrat:wght@400;600;700;800", kind: "heading" },
  { id: "Poppins", css: "'Poppins',Arial,sans-serif", g: "Poppins:wght@400;600;700;800", kind: "heading" },
  { id: "Oswald", css: "'Oswald',Arial,sans-serif", g: "Oswald:wght@400;500;700", kind: "heading" },
  { id: "Bebas Neue", css: "'Bebas Neue',Impact,Arial,sans-serif", g: "Bebas+Neue", kind: "heading" },
  { id: "Archivo", css: "'Archivo',Arial,sans-serif", g: "Archivo:wght@400;600;700;800", kind: "heading" },
  { id: "Playfair Display", css: "'Playfair Display',Georgia,serif", g: "Playfair+Display:wght@400;600;700;800", kind: "heading" },
  { id: "PT Serif", css: "'PT Serif',Georgia,serif", g: "PT+Serif:wght@400;700", kind: "body" },
  { id: "Lora", css: "'Lora',Georgia,serif", g: "Lora:wght@400;500;700", kind: "body" },
  { id: "Merriweather", css: "'Merriweather',Georgia,serif", g: "Merriweather:wght@400;700", kind: "body" },
  { id: "Source Serif 4", css: "'Source Serif 4',Georgia,serif", g: "Source+Serif+4:wght@400;600;700", kind: "body" },
  { id: "EB Garamond", css: "'EB Garamond',Georgia,serif", g: "EB+Garamond:wght@400;500;600;700", kind: "body" },
  { id: "Libre Baskerville", css: "'Libre Baskerville',Georgia,serif", g: "Libre+Baskerville:wght@400;700", kind: "body" },
  { id: "Inter", css: "'Inter',system-ui,Arial,sans-serif", g: "Inter:wght@400;600;700", kind: "both" },
];
export const HEADING_FONTS = FONTS.filter((f) => f.kind === "heading" || f.kind === "both");
export const BODY_FONTS = FONTS.filter((f) => f.kind === "body" || f.kind === "both");

// ── Cover element catalog (the editor's "Cover layout" list) ─────────────────
export const COVER_ELEMENTS: { key: CoverElKey; label: string; text: boolean }[] = [
  { key: "logo", label: "Logo", text: false },
  { key: "embroidery", label: "Embroidery border", text: false },
  { key: "title", label: "Document title", text: true },
  { key: "standard", label: "Accreditation line", text: true },
  { key: "number", label: "Scheme number", text: true },
  { key: "schemeTitle", label: "Scheme title", text: true },
  { key: "image", label: "Cover image", text: false },
];
const ALL_KEYS: CoverElKey[] = COVER_ELEMENTS.map((e) => e.key);
export const COVER_LABEL: Record<CoverElKey, string> =
  Object.fromEntries(COVER_ELEMENTS.map((e) => [e.key, e.label])) as Record<CoverElKey, string>;
// elements whose `size` controls a dimension (logos/images), not font size
const SIZED_IMG = new Set<CoverElKey>(["logo", "image"]);
// elements that go inside the header band when band is on
const BAND_KEYS = new Set<CoverElKey>(["logo", "title"]);

// ── Base presets (the editor's "Start from") ─────────────────────────────────
export const BASES: { id: SkinBase; label: string; description: string }[] = [
  { id: "classic", label: "Classic", description: "The PTS brand — embroidery cover, green & red, PT Serif." },
  { id: "modern", label: "Modern", description: "Left-aligned, deep green, airy." },
  { id: "banded", label: "Banded", description: "Logo + title on a coloured header panel." },
  { id: "editorial", label: "Editorial", description: "Playfair headings + Garamond body, centred." },
  { id: "bold", label: "Bold", description: "Big condensed headings, strong accent." },
  { id: "minimal", label: "Minimal", description: "Black-on-white, one rule, maximum content." },
  { id: "blank", label: "Blank", description: "A bare canvas — logo, title, number. Build it up yourself." },
];

type Preset = Omit<CustomSkinData, "id" | "name" | "scope">;

const el = (key: CoverElKey, shown: boolean, align: Align, size: ElSize = "m"): CoverEl => ({ key, shown, align, size });

export function basePreset(base: SkinBase): Preset {
  switch (base) {
    case "modern":
      return {
        base,
        colors: { primary: "#357a4f", accent: "#2b6744", heading: "#2b6744", bg: "#ffffff" },
        fonts: { heading: "Montserrat", body: "PT Serif" },
        logo: "default", density: "airy", band: { on: false, color: "primary" },
        elements: [
          el("logo", true, "left"), el("title", true, "left", "l"), el("number", true, "left"),
          el("schemeTitle", true, "left"), el("standard", true, "left"),
          el("embroidery", false, "center"), el("image", false, "left"),
        ],
      };
    case "banded":
      return {
        base,
        colors: { primary: "#2b6744", accent: "#357a4f", heading: "#2b6744", bg: "#ffffff" },
        fonts: { heading: "Montserrat", body: "PT Serif" },
        logo: "default", density: "normal", band: { on: true, color: "primary" },
        elements: [
          el("logo", true, "left"), el("title", true, "left", "l"), el("number", true, "left"),
          el("schemeTitle", true, "left"), el("standard", true, "left"),
          el("embroidery", false, "center"), el("image", false, "left"),
        ],
      };
    case "editorial":
      return {
        base,
        colors: { primary: "#5a4632", accent: "#7a2b2b", heading: "#2a2118", bg: "#fffdf8" },
        fonts: { heading: "Playfair Display", body: "EB Garamond" },
        logo: "default", density: "airy", band: { on: false, color: "primary" },
        elements: [
          el("logo", true, "center"), el("title", true, "center", "l"), el("standard", true, "center"),
          el("number", true, "center"), el("schemeTitle", true, "center"),
          el("embroidery", false, "center"), el("image", false, "center"),
        ],
      };
    case "bold":
      return {
        base,
        colors: { primary: "#111111", accent: "#d4341f", heading: "#111111", bg: "#ffffff" },
        fonts: { heading: "Bebas Neue", body: "Inter" },
        logo: "default", density: "compact", band: { on: false, color: "accent" },
        elements: [
          el("logo", true, "left"), el("title", true, "left", "l"), el("number", true, "left", "l"),
          el("schemeTitle", true, "left"), el("standard", true, "left", "s"),
          el("embroidery", false, "center"), el("image", false, "left"),
        ],
      };
    case "minimal":
      return {
        base,
        colors: { primary: "#2b2b2b", accent: "#111111", heading: "#111111", bg: "#ffffff" },
        fonts: { heading: "Inter", body: "Source Serif 4" },
        logo: "default", density: "normal", band: { on: false, color: "primary" },
        elements: [
          el("logo", true, "left"), el("title", true, "left", "l"), el("number", true, "left"),
          el("schemeTitle", true, "left"), el("standard", true, "left"),
          el("embroidery", false, "center"), el("image", false, "left"),
        ],
      };
    case "blank":
      return {
        base,
        colors: { primary: "#444444", accent: "#444444", heading: "#222222", bg: "#ffffff" },
        fonts: { heading: "Inter", body: "PT Serif" },
        logo: "default", density: "normal", band: { on: false, color: "primary" },
        elements: [
          el("logo", true, "center"), el("title", true, "center"), el("number", true, "center"),
          el("schemeTitle", false, "center"), el("standard", false, "center"),
          el("embroidery", false, "center"), el("image", false, "center"),
        ],
      };
    case "classic":
    default:
      return {
        base: "classic",
        colors: { primary: "#5f7d52", accent: "#9e2b2b", heading: "#5f7d52", bg: "#ffffff" },
        fonts: { heading: "Sofia Sans Condensed", body: "PT Serif" },
        logo: "default", density: "normal", band: { on: false, color: "primary" },
        elements: [
          el("logo", true, "center"), el("embroidery", true, "center"), el("title", true, "center"),
          el("standard", true, "center"), el("number", true, "center"), el("schemeTitle", true, "center"),
          el("image", false, "center"),
        ],
      };
  }
}

// A fresh skin's data for a chosen base (the editor's starting point; id/name set by caller).
export function newSkinData(base: SkinBase): Omit<CustomSkinData, "id"> {
  return { name: "", scope: "both", ...basePreset(base) };
}

// ── Defensive value guards (used by BOTH the server validator and the renderer) ──
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export function safeColor(c: unknown, fallback: string): string {
  return typeof c === "string" && HEX.test(c.trim()) ? c.trim() : fallback;
}
function validFont(id: unknown, list: FontDef[], fallback: string): string {
  return typeof id === "string" && list.some((f) => f.id === id) ? id : fallback;
}
function fontCss(id: string, list: FontDef[]): string {
  return (list.find((f) => f.id === id) ?? list[0]).css;
}
function fontSpec(id: string): string {
  return (FONTS.find((f) => f.id === id) ?? FONTS[0]).g;
}
function validAlign(a: unknown): Align {
  return a === "left" || a === "center" || a === "right" ? a : "center";
}
function validSize(s: unknown): ElSize {
  return s === "s" || s === "m" || s === "l" ? s : "m";
}
function validDensity(d: unknown): Density {
  return d === "compact" || d === "normal" || d === "airy" ? d : "normal";
}
function validBandColor(c: unknown): BandColor {
  return c === "primary" || c === "accent" || c === "heading" ? c : "primary";
}
function safeLogo(raw: unknown, fallback: string): string {
  const v = String(raw ?? "").trim();
  if (!v || v === "default") return "default";
  if (/^\/brand\/[\w-]+\.(png|jpe?g|svg|webp)$/i.test(v)) return v;
  if (v.length <= 400 && /^https:\/\/[\w.-]+(:\d+)?(\/[\w./%~+-]*)?$/.test(v)) return v;
  return fallback;
}
function logoSrc(logo: string): string {
  return escAttr(logo === "default" ? "/brand/logo.png" : logo);
}
// Escape a value destined for a double-quoted HTML attribute.
function escAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// Mix a hex colour toward white by `amount` (0..1). Used to derive a soft tint of
// the primary for table headers / role chips so a custom theme stays cohesive.
function tint(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return "#eef3ea";
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (v: number) => Math.round(v + (255 - v) * amount);
  const to2 = (v: number) => m(v).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

// ── The server-side validator: untrusted input → a clean CustomSkinData ───────
export function sanitizeSkinData(raw: unknown, id: string): CustomSkinData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const base: SkinBase = BASES.some((b) => b.id === r.base) ? (r.base as SkinBase) : "classic";
  const preset = basePreset(base);
  const scope: SkinScope = (["T", "C", "both"] as const).includes(r.scope as SkinScope)
    ? (r.scope as SkinScope) : "both";
  // strip angle brackets; the name is only shown in the UI (React-escaped), never CSS
  const name = String(r.name ?? "").replace(/[<>]/g, "").trim().slice(0, 60) || "My skin";
  const rc = (r.colors ?? {}) as Record<string, unknown>;
  const rf = (r.fonts ?? {}) as Record<string, unknown>;
  const rb = (r.band ?? {}) as Record<string, unknown>;
  return {
    id,
    name,
    scope,
    base,
    colors: {
      primary: safeColor(rc.primary, preset.colors.primary),
      accent: safeColor(rc.accent, preset.colors.accent),
      heading: safeColor(rc.heading, preset.colors.heading),
      bg: safeColor(rc.bg, preset.colors.bg),
    },
    fonts: {
      heading: validFont(rf.heading, HEADING_FONTS, preset.fonts.heading),
      body: validFont(rf.body, BODY_FONTS, preset.fonts.body),
    },
    logo: safeLogo(r.logo, preset.logo),
    density: r.density === undefined ? preset.density : validDensity(r.density),
    band: r.band === undefined
      ? preset.band
      : { on: !!rb.on, color: rb.color === undefined ? preset.band.color : validBandColor(rb.color) },
    elements: sanitizeElements(r.elements, preset.elements),
  };
}

function sanitizeElements(raw: unknown, fallback: CoverEl[]): CoverEl[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<CoverElKey>();
  const out: CoverEl[] = [];
  for (const e of arr) {
    const key = (e as { key?: unknown })?.key as CoverElKey;
    if (!ALL_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      shown: !!(e as { shown?: unknown }).shown,
      align: validAlign((e as { align?: unknown }).align),
      size: validSize((e as { size?: unknown }).size),
    });
  }
  for (const f of fallback) if (!seen.has(f.key)) out.push({ ...f });
  return out;
}

// ── Pure render helpers (shared by compileSkin + the editor's live preview) ───
export function skinFontsHref(data: CustomSkinData): string {
  const specs = [...new Set([fontSpec(data.fonts.heading), fontSpec(data.fonts.body)])];
  return `https://fonts.googleapis.com/css2?${specs.map((s) => "family=" + s).join("&")}&display=swap`;
}

const DENSITY_GAP: Record<Density, string> = { compact: "4px", normal: "8px", airy: "14px" };

export function skinCss(data: CustomSkinData): string {
  const c = data.colors;
  const primary = safeColor(c.primary, "#5f7d52");
  const accent = safeColor(c.accent, "#9e2b2b");
  const head = safeColor(c.heading, "#5f7d52");
  const bg = safeColor(c.bg, "#ffffff");
  const sans = fontCss(data.fonts.heading, HEADING_FONTS);
  const serif = fontCss(data.fonts.body, BODY_FONTS);
  const gap = DENSITY_GAP[validDensity(data.density)];
  const bandCol = data.band.color === "accent" ? accent : data.band.color === "heading" ? head : primary;
  const overrides = `
  :root{--green:${primary};--green-dark:${head};--green-soft:${tint(primary, 0.88)};--red:${accent};
    --sans:${sans};--serif:${serif};}
  body{background:${bg};}
  .ccover{break-after:page;page-break-after:always;padding-bottom:18px;}
  .ccover .crow{margin:0 0 ${gap};font-size:11pt;}
  .ccover .crow.sz-s{font-size:9pt;} .ccover .crow.sz-l{font-size:13.5pt;}
  .ccover .clogo{height:60px;}
  .ccover .crow.sz-s .clogo{height:44px;} .ccover .crow.sz-l .clogo{height:80px;}
  .ccover .cemb{display:block;width:100%;height:auto;margin:8px 0;}
  .ccover .cttl{font-family:var(--sans);font-weight:800;color:var(--green-dark);font-size:2.05em;line-height:1.1;margin:6px 0 0;letter-spacing:.2px;}
  .ccover .cacc{color:var(--muted);font-size:0.95em;}
  .ccover .cno{font-family:var(--sans);font-weight:800;color:var(--red);font-size:1.35em;margin-top:4px;}
  .ccover .csttl{font-family:var(--sans);font-weight:700;font-size:1.18em;}
  .ccover .cimg{max-width:50%;height:auto;border-radius:8px;margin-top:8px;}
  .ccover .crow.sz-s .cimg{max-width:38%;} .ccover .crow.sz-l .cimg{max-width:66%;}
  .ccover .cband{background:${bandCol};border-radius:12px;padding:18px 22px;margin-bottom:12px;}
  .ccover .cband .crow{margin:0;} .ccover .cband .crow + .crow{margin-top:6px;}
  .ccover .cband .clogo{filter:brightness(0) invert(1);}
  .ccover .cband .cttl{color:#fff;}`;
  return DOC_CSS + overrides;
}

function elRow(e: CoverEl, inner: string): string {
  return `<div class="crow sz-${validSize(e.size)}" data-key="${e.key}" style="text-align:${validAlign(e.align)}">${inner}</div>`;
}

function coverHtml(
  data: CustomSkinData, s: Scheme, lang: Lang,
  docTitleEn: string, docTitleBg: string, opts: { withImage?: boolean } = {}
): string {
  const inAcc = pick(lang, "in accordance with", "съгласно");
  const parts: Record<CoverElKey, string> = {
    logo: `<img class="clogo" src="${logoSrc(data.logo)}" alt="PTS Bulgaria">`,
    embroidery: `<img class="cemb" src="/brand/embroidery-border.png" alt="">`,
    title: `<div class="cttl">${esc(pick(lang, docTitleEn, docTitleBg))}</div>`,
    standard: `<div class="cacc">${esc(inAcc)} ${esc(s.standard)}</div>`,
    number: `<div class="cno">${esc(s.number)}</div>`,
    schemeTitle: `<div class="csttl">${esc(pick(lang, s.titleEn, s.titleBg))}</div>`,
    image: opts.withImage && s.coverImage ? `<img class="cimg" src="${escAttr(s.coverImage)}" alt="">` : "",
  };
  const shown = data.elements.filter((e) => e.shown && parts[e.key]);

  if (data.band.on) {
    const inBand = shown.filter((e) => BAND_KEYS.has(e.key)).map((e) => elRow(e, parts[e.key])).join("");
    const rest = shown.filter((e) => !BAND_KEYS.has(e.key)).map((e) => elRow(e, parts[e.key])).join("");
    const band = inBand ? `<div class="cband">${inBand}</div>` : "";
    return `<div class="cover ccover">${band}${rest}</div>`;
  }
  const rows = shown.map((e) => elRow(e, parts[e.key])).join("");
  return `<div class="cover ccover">${rows}</div>`;
}

function footerHtml(_data: CustomSkinData, s: Scheme, formNumber: string): string {
  return `<div class="docfooter">${esc(s.revision)} · ${esc(formNumber)} · ${esc(s.revisionDate)}</div>`;
}

// Compile stored skin DATA into a live Skin object (used by the render path).
export function compileSkin(data: CustomSkinData): Skin {
  const types: SchemeType[] = data.scope === "both" ? ["T", "C"] : [data.scope];
  const baseLabel = BASES.find((b) => b.id === data.base)?.label ?? "Custom";
  return {
    meta: {
      id: data.id,
      name: data.name,
      description: `Your skin — ${baseLabel} base, custom colours & cover.`,
      types,
    },
    css: skinCss(data),
    fontsHref: skinFontsHref(data),
    cover: (s, lang, en, bg, opts) => coverHtml(data, s, lang, en, bg, opts),
    footer: (s, formNumber) => footerHtml(data, s, formNumber),
  };
}

// ── Sample document for the editor's live preview (no real scheme needed) ─────
const SAMPLE = {
  number: "PTS 26/04-T-1",
  titleEn: "Paving blocks — compressive strength",
  titleBg: "Тротоарни плочи — якост на натиск",
  standard: "ISO/IEC 17043:2023",
  revision: "Rev. 1",
  revisionDate: "16.06.2026",
  coverImage: "",
} as unknown as Scheme;

const SAMPLE_DOC_EN = "Proficiency Testing Scheme — Plan";
const SAMPLE_DOC_BG = "Схема за изпитване за пригодност — План";

function sampleBody(lang: Lang): string {
  const h = pick(lang, "Objective of the comparison", "Цел на сравнението");
  const p = pick(
    lang,
    "Sample document text showing the chosen fonts, heading colour and section rule.",
    "Примерен текст на документа, показващ избраните шрифтове, цвят на заглавията и линия на раздела."
  );
  const ch = pick(lang, "Characteristic", "Характеристика");
  const mt = pick(lang, "Method", "Метод");
  const v = pick(lang, "Compressive strength", "Якост на натиск");
  return `<h2 class="sec"><span class="n">1.</span> ${esc(h)}</h2>
  <div class="body"><p>${esc(p)}</p>
  <table class="ptable"><tr><th>${esc(ch)}</th><th>${esc(mt)}</th></tr>
  <tr><td>${esc(v)}</td><td>EN 1338</td></tr></table></div>`;
}

// Full standalone HTML for the editor's <iframe srcDoc>. Faithful to compileSkin
// (same skinCss + coverHtml), so what you see is what the PDF renders.
export function previewDocHtml(data: CustomSkinData, lang: Lang = "bg"): string {
  const cover = coverHtml(data, SAMPLE, lang, SAMPLE_DOC_EN, SAMPLE_DOC_BG, { withImage: false });
  return `<!DOCTYPE html><html lang="${lang === "bg" ? "bg" : "en"}"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${skinFontsHref(data)}" rel="stylesheet">
<style>${skinCss(data)}</style></head>
<body><div class="page">${cover}${sampleBody(lang)}</div></body></html>`;
}
