"use client";

import { useEffect, useRef, useState } from "react";
import { saveDocHtmlAction, translateDocHtmlAction, translateAction, addLibraryItemAction, saveDocTemplateAction, deleteDocTemplateAction, uploadCoverImageAction, setDocReadyAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";
import { FONTS_HREF } from "@/lib/doc-css";
import { sanitizeDocHtml } from "@/lib/sanitize-html";
import { formulaToMathML, PT_FORMULAS } from "@/lib/formula";
import { categoryLabel, groupByCategory } from "@/lib/element-categories";

type Snippet = { id: string; name: string; category?: string; bg: string; en: string };
type Field = { key: string; label: string; bg: string; en: string };
type FormEl = { id: string; nameBg: string; nameEn: string; category?: string; bg: string; en: string };
type Tmpl = { id: string; name: string; bg: string; en: string };
type CopyItem = { id: string; number: string; title: string; bg: string; en: string };

// Print geometry (must match the PDF route + DOC_CSS @page): A4 210mm wide, 14mm
// side margins → 182mm content; 297mm tall, 16+18mm margins → 263mm per page.
const PXMM = 96 / 25.4;            // CSS px per mm (browsers assume 96dpi)
const PAGE_W_MM = 182;             // editable paper width = PDF content width
const PAGE_BREAK_MM = 263;         // content height per A4 page
const mmToPx = (mm: number) => mm * PXMM;
const pxToMm = (px: number) => px / PXMM;
const roundMm = (mm: number) => Math.max(1, Math.round(mm));

type Wrap = "inline" | "left" | "right" | "center" | "free";
type Unit = "mm" | "cm" | "px";

// Text-colour palette for the toolbar "A▾" button: brand greens, accents, neutrals.
const TEXT_COLORS = ["#456b2c", "#57823c", "#6e925a", "#8fa97e", "#9e2b2b", "#cf4911", "#9a6b22", "#2f6f8f", "#1a1a1a", "#3e3e3e", "#666666", "#ffffff"];
const TEXT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28];
// Font choices for the toolbar picker. The two brand webfonts are loaded in the
// editor AND the print/PDF shell (FONTS_HREF); the rest are system fonts present
// in every browser incl. the Playwright Chromium that renders the PDFs.
const FONT_FAMILIES: { label: string; css: string }[] = [
  { label: "PT Serif", css: "'PT Serif', Georgia, serif" },
  { label: "Sofia Sans Condensed", css: "'Sofia Sans Condensed', Arial, sans-serif" },
  { label: "Times New Roman", css: "'Times New Roman', Times, serif" },
  { label: "Georgia", css: "Georgia, serif" },
  { label: "Arial", css: "Arial, Helvetica, sans-serif" },
  { label: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { label: "Courier New", css: "'Courier New', monospace" },
];
// Highlight (text background) + table-cell fill swatches — soft Word-like tints.
const HILITE_COLORS = ["#fff3a3", "#ffd9a0", "#c9f2c7", "#bfe3ff", "#ffc9de", "#e9d8fd", "#e6e6e6"];
// The Ω symbol palette — measurement/PT characters the documents actually use.
const SYMBOLS = [
  "±", "×", "·", "÷", "≤", "≥", "≠", "≈",
  "‰", "°", "℃", "µ", "Ω", "π", "σ", "ζ",
  "α", "β", "λ", "θ", "Δ", "√", "∞", "x̄",
  "²", "³", "½", "¼", "¾", "→", "№", "§",
];
// mini alignment icon (three bars) for the toolbar buttons
const alignIcon = (k: "left" | "center" | "right" | "full") => (
  <span style={{ display: "inline-flex", flexDirection: "column", gap: 2.5, alignItems: k === "left" ? "flex-start" : k === "center" ? "center" : k === "right" ? "flex-end" : "stretch", width: 14 }}>
    {[10, 14, 8].map((w, i) => (
      <span key={i} style={{ height: 1.6, background: "currentColor", width: k === "full" ? 14 : w, borderRadius: 1 }} />
    ))}
  </span>
);
const CELL_COLORS = ["#eef3ea", "#fdeaea", "#fff7d6", "#e7f0fb", "#f1ece1", "#f0f0f0", "#ffffff"];
// Must match COVER_MARK in lib/doc-css.ts — flags content that already carries its
// own title page (so the editor shows the cover and the export doesn't re-add it).
const COVER_MARK = "<!--PTS:CV-->";
const hasCover = (html: string) => html.includes(COVER_MARK);

// Title-page (cover) styling for the three built-in skins, scoped to the editor
// paper so the baked-in cover renders faithfully while editing (the body keeps the
// editor's own styles). Mirrors DOC_CSS / the skin overrides.
const COVER_CSS = `
  .we-page .cover{text-align:center;padding-bottom:14px;}
  .we-page .head{display:flex;align-items:center;gap:16px;} .we-page .head .logo{height:60px;} .we-page .head .tag{height:24px;margin-left:auto;}
  .we-page .emb{display:block;width:100%;height:auto;margin:10px 0 6px;}
  .we-page .docttl{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:#5f7d52;font-size:22pt;margin:14px 0 2px;}
  .we-page .inacc{color:var(--muted);font-size:10.5pt;}
  .we-page .schemeno{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;color:var(--red);font-size:14pt;margin-top:10px;}
  .we-page .schemettl{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:13pt;margin:2px 0 10px;}
  .we-page .coverimg{width:46%;max-width:100%;height:auto;border-radius:8px;margin-top:10px;cursor:pointer;}
  .we-page .coverimg-empty{opacity:.95;}
  .we-page .contacts{display:flex;gap:14px;justify-content:center;margin-top:22px;flex-wrap:wrap;}
  .we-page .contact{display:flex;align-items:center;gap:10px;border:1px solid #88a77b;border-radius:10px;padding:9px 16px;background:#fff;}
  .we-page .contact .ico{display:inline-flex;flex:0 0 auto;} .we-page .contact .ico svg{width:28px;height:28px;display:block;}
  .we-page .contact .ctext{color:var(--red);font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:11pt;letter-spacing:.2px;}
  /* Modern skin cover */
  .we-page .mcover{padding-bottom:14px;}
  .we-page .mcover .mband{display:flex;align-items:center;gap:16px;background:#2b6744;border-radius:12px;padding:18px 22px;}
  .we-page .mcover .mband .mlogo{height:50px;filter:brightness(0) invert(1);}
  .we-page .mcover .mband .mttl{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:#fff;font-size:21pt;letter-spacing:.4px;}
  .we-page .mcover .minfo{margin-top:18px;}
  .we-page .mcover .minfo .mno{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:#2b6744;font-size:16pt;}
  .we-page .mcover .minfo .mname{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:13pt;margin-top:2px;}
  .we-page .mcover .minfo .macc{color:var(--muted);font-size:10.5pt;margin-top:6px;}
  .we-page .mcover .coverimg{width:52%;max-width:100%;}
  /* Minimal skin cover */
  .we-page .mincover{text-align:left;padding:6px 0 14px;}
  .we-page .mincover .minlogo{height:38px;}
  .we-page .mincover .mintitle{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:#111;font-size:24pt;letter-spacing:.4px;margin:22px 0 0;}
  .we-page .mincover .minrule{height:2px;width:60px;background:#111;margin:10px 0 14px;}
  .we-page .mincover .minno{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:12.5pt;}
  .we-page .mincover .minacc{color:var(--muted);font-size:10.5pt;margin-top:4px;}
  /* lighter document header (logo + embroidery band + centred title) */
  .we-page .dochead-wrap{position:relative;z-index:41;background:#fff;margin:-26px 0 0 -50px;padding:26px 0 4px 50px;}
  .we-page .dochead{display:flex;align-items:center;gap:18px;margin:0 0 4px;}
  .we-page .dochead .logo{height:54px;flex:0 0 auto;}
  .we-page .dochead .hband{flex:1;height:38px;background:url(/brand/embroidery-border.png) left center/auto 100% repeat-x;}
  .we-page .docttl2{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:#5f7d52;font-size:20pt;text-align:center;letter-spacing:1.5px;margin:14px 0 8px;}
`;

const EDITOR_CSS = `
  /* the whole header (toolbar + contextual bars) sticks as one unit, so the
     contextual bar is always visible right under the toolbar (whatever its height) */
  .we-stickyhead{position:sticky;top:0;z-index:30;background:var(--canvas);padding-top:2px;}
  .we-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;background:var(--green-soft);border:1px solid var(--green-line);border-radius:10px;}
  .we-tool{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:36px;padding:0 11px;border:1px solid var(--line);background:#fff;border-radius:8px;cursor:pointer;font-weight:700;font-size:15px;color:var(--ink);transition:background .12s,border-color .12s;}
  .we-tool:hover{background:var(--green-soft);border-color:var(--green-line);}
  .we-sep{width:1px;height:24px;background:var(--green-line);margin:0 3px;}

  .we-body{display:flex;gap:24px;align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:14px;padding:28px;}
  .we-col{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:16px;overflow:auto;}

  /* the paper = exactly the PDF content box (182mm), real document body styles */
  .we-page{--green-dark:#5f7d52;--green:#88a77b;--green-soft:#eef3ea;--green-line:#b7d0c0;--red:#9e2b2b;--ink:#1a1a1a;--muted:#6b6b6b;--line:#dcdcdc;position:relative;width:${PAGE_W_MM}mm;color:var(--ink);border:2px solid #111;border-radius:4px;
    padding:26px 30px 50px 50px;box-shadow:0 8px 28px rgba(15,30,22,.10);
    font-family:'PT Serif',Georgia,serif;font-size:11pt;line-height:1.5;background:#fff;}
  /* traditional embroidery border down the left (matches the printed document) */
  .we-page::before{content:"";position:absolute;top:0;bottom:0;left:0;width:30px;background:url(/brand/embroidery-side.png) top center/100% auto repeat-y;border-radius:4px 0 0 4px;pointer-events:none;z-index:0;}
  .we-docbody{position:relative;min-height:55vh;outline:none;z-index:1;}
  .we-docbody:focus{outline:none;}
  .we-page.focused{box-shadow:0 8px 28px rgba(15,30,22,.12),0 0 0 2px var(--green-light);}
  .we-page h2{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:13.5pt;color:var(--ink);border-bottom:2.5px solid var(--red);padding-bottom:5px;margin:20px 0 4px;}
  .we-page h3{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:11.5pt;color:var(--green-dark);margin:12px 0 3px;}
  .we-page p{margin:6px 0;}
  .we-page ul,.we-page ol{margin:6px 0 6px 0;padding-left:26px;}
  .we-page ul{list-style:disc;} .we-page ol{list-style:decimal;}
  /* nested numbered lists: 1. / 1.1. / 1.2. — press ⇥ (indent) inside a list */
  .we-page ol{counter-reset:item;} .we-page ol>li{counter-increment:item;}
  .we-page ol>li::marker{content:counters(item,".") ". ";}
  .we-page ul ul,.we-page ol ol,.we-page ul ol,.we-page ol ul{margin:2px 0;}
  .we-page li{margin:3px 0;}
  .we-page img{max-width:100%;height:auto;cursor:pointer;}
  .we-page img.free{position:absolute;max-width:none;z-index:1;}
  .we-page table{border-collapse:collapse;width:100%;font-family:'Sofia Sans Condensed',sans-serif;font-size:10pt;margin:6px 0;}
  .we-page table td,.we-page table th{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top;}
  .we-page table th{background:var(--green-soft);color:var(--green-dark);}
  .we-docbody:empty:before{content:"${"Start typing, or insert an item from the panel →"}";color:var(--muted);}

  /* page break: the overflowing block is pushed to the next page; the rest of the
     current page stays WHITE like a real sheet, and only a thin neutral seam marks
     where one page ends and the next begins — a clean, document-viewer-like gutter
     (no loud stripes). The seam fades in gently so pagination doesn't "pop". */
  .we-gap{position:relative;user-select:none;pointer-events:none;background:transparent;}
  .we-gapsep{position:absolute;left:-52px;right:-32px;bottom:0;height:18px;
    background:linear-gradient(#eef1ea,#e3e8dd);
    box-shadow:inset 0 3px 5px -3px rgba(31,45,33,.20),inset 0 -1px 0 rgba(0,0,0,.05);
    display:flex;align-items:center;justify-content:center;z-index:3;animation:we-seam-in .18s ease-out;}
  .we-gaplabel{font-size:9px;font-weight:700;color:#8a9880;background:#fff;border:1px solid #dde4d6;border-radius:999px;padding:1px 11px;letter-spacing:.06em;box-shadow:0 1px 2px rgba(0,0,0,.05);}
  @keyframes we-seam-in{from{opacity:0}to{opacity:1}}
  /* image selection handles overlay */
  .we-ov{position:absolute;inset:0;pointer-events:none;z-index:6;}
  /* inline PDF preview */
  .we-preview{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--canvas);}
  .we-preview iframe{display:block;width:100%;height:82vh;border:0;}
  .we-h{position:absolute;width:11px;height:11px;background:#fff;border:1.6px solid var(--green-dark);border-radius:2px;pointer-events:auto;}
  .we-h.nw{cursor:nwse-resize;} .we-h.ne{cursor:nesw-resize;} .we-h.sw{cursor:nesw-resize;} .we-h.se{cursor:nwse-resize;}
  .we-h.n,.we-h.s{cursor:ns-resize;} .we-h.e,.we-h.w{cursor:ew-resize;}
  .we-h.mv{cursor:move;border-radius:50%;background:var(--green-dark);}
  .we-selbox{position:absolute;border:1.5px solid var(--green-dark);pointer-events:none;}

  .we-imgbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid var(--green-line);border-radius:12px;padding:10px 14px;box-shadow:0 6px 18px rgba(15,30,22,.12);margin-bottom:12px;}
  .we-swrow{display:inline-flex;align-items:center;gap:5px;}
  .we-sw-sm{width:20px;height:20px;border-radius:5px;border:1px solid rgba(0,0,0,.12);cursor:pointer;padding:0;}
  .we-sw-sm:hover{transform:scale(1.12);}
  .we-imgbar .grp{display:inline-flex;align-items:center;gap:6px;}
  .we-num{width:52px;border:1px solid var(--line);border-radius:7px;padding:5px 6px;font-size:13px;text-align:center;}
  .we-pill{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 11px;border:1px solid var(--line);background:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:var(--ink);}
  .we-pill:hover{background:var(--green-soft);}
  .we-pill.active{background:var(--green-soft);border-color:var(--green-line);color:var(--green-dark);}
  .we-pill.danger{color:var(--red);border-color:var(--red-soft);background:#fdf5f4;}
  .we-unit{display:inline-flex;border:1px solid var(--line);border-radius:7px;overflow:hidden;}
  .we-unit button{border:0;background:#fff;padding:5px 8px;font-size:12px;font-weight:700;cursor:pointer;color:var(--muted);}
  .we-unit button.active{background:var(--green-soft);color:var(--green-dark);}

  .we-panel{width:330px;flex-shrink:0;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 4px 14px rgba(15,30,22,.06);padding:16px;position:sticky;top:76px;align-self:flex-start;max-height:calc(100vh - 96px);overflow:auto;}
  .we-panelhdr{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
  .we-panelhdr .ttl{font-weight:700;font-size:16px;color:var(--ink);}
  .we-collapse{margin-left:auto;border:0;background:none;cursor:pointer;color:var(--muted);font-size:14px;line-height:1;padding:4px;}
  .we-seclabel{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);}
  .we-subsec{font-size:10.5px;font-weight:700;letter-spacing:.05em;color:var(--green-dark);margin:8px 0 2px;display:flex;align-items:center;gap:6px;}
  .we-subsec::after{content:"";flex:1;height:1px;background:var(--green-line);opacity:.6;}
  .we-item{border:1px solid transparent;border-radius:10px;margin-bottom:2px;overflow:hidden;}
  .we-item>button{width:100%;text-align:left;background:none;border:0;padding:12px;cursor:pointer;font-size:15px;font-weight:600;color:var(--ink);display:flex;gap:10px;align-items:center;border-radius:9px;}
  .we-item>button:hover{background:var(--green-soft);}
  .we-item.open{border-color:var(--green-line);}
  .we-item.open>button{background:var(--green-soft);color:var(--green-dark);}
  .we-addown{width:100%;display:inline-flex;align-items:center;justify-content:center;padding:13px;border:1.5px dashed var(--green-line);border-radius:9px;background:none;color:var(--green-dark);font-weight:700;font-size:14px;cursor:pointer;}
  .we-addown:hover{background:var(--green-soft);}
  .we-prev{background:#fff;border:1px solid var(--line);border-radius:6px;padding:10px;font-family:'PT Serif',Georgia,serif;font-size:9.5pt;line-height:1.45;max-height:220px;overflow:auto;}
  .we-prev h2{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:10pt;color:var(--green-dark);margin:4px 0;}
  .we-prev p{margin:3px 0;} .we-prev img{max-width:100%;height:auto;} .we-prev ul,.we-prev ol{margin:3px 0 3px 18px;}

  /* faithful rendering of the real document markup inside the editor */
  .we-page h2.sec{font-size:13.5pt;color:var(--ink);border-bottom:2.5px solid var(--red);padding-bottom:5px;}
  .we-page h2.sec .n{color:var(--green-dark);}
  .we-page h3.sub{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:11.5pt;color:var(--green-dark);margin:12px 0 3px;}
  .we-page .body{margin-bottom:6px;} .we-page .muted{color:var(--muted);font-size:.9em;}
  .we-page .note{font-size:.82em;color:var(--muted);margin:4px 0 2px;}
  .we-page .example{font-size:.82em;font-style:italic;color:var(--muted);margin:3px 0;}
  .we-page .imp{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;color:var(--red);margin:8px 0 4px;}
  .we-page table.ptable th{background:var(--green-soft);color:var(--green-dark);}
  .we-page .team{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
  .we-page .role{background:var(--green-soft);border-radius:6px;padding:5px 9px;}
  .we-page .role .rl{display:block;font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:.86em;color:var(--green-dark);}
  .we-page .partner{display:flex;gap:12px;align-items:flex-start;} .we-page .partner img{height:46px;} .we-page .partner ul{margin:4px 0 0;padding-left:18px;font-size:.9em;}
  .we-page .cals{display:flex;gap:8px;flex-wrap:wrap;}
  .we-page .cal{width:96px;border:1px solid var(--green-line);border-radius:8px;overflow:hidden;text-align:center;}
  .we-page .cal .bar{display:block;height:10px;background:var(--green-dark);}
  .we-page .cal .d{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;color:var(--red);font-size:1.15em;padding:4px 0 0;}
  .we-page .cal .lbl{font-size:.72em;color:var(--muted);padding:2px 4px 6px;line-height:1.15;}
  .we-page .fld{margin:7px 0;} .we-page .fld .fl{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:.9em;}
  .we-page .blank{display:inline-block;min-width:220px;border-bottom:1px solid var(--line);height:15px;vertical-align:bottom;}
  .we-page .selbox{display:inline-block;border:1px solid var(--green-dark);border-radius:5px;padding:1px 10px;font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;color:var(--green-dark);font-size:.9em;}
  .we-page .sig{display:flex;justify-content:space-between;gap:24px;margin-top:22px;}
  .we-page .sig .col{flex:1;border-top:2px solid var(--green-dark);padding-top:4px;font-size:.82em;color:var(--ink);text-align:center;}
  .we-page .formula{background:var(--green-soft);border-left:3px solid var(--green-dark);padding:7px 12px;font-family:'Sofia Sans Condensed',sans-serif;margin:7px 0;}
  .we-page .internal{border:1px dashed var(--green-dark);background:var(--green-soft);border-radius:6px;padding:9px 12px;margin:8px 0 4px;color:var(--green-dark);font-family:'Sofia Sans Condensed',sans-serif;font-size:.9em;}
  .we-page ul.tight{margin:4px 0;padding-left:20px;} .we-page ul.tight li{margin:3px 0;}
  .we-page .ohead{display:flex;align-items:center;gap:14px;border-bottom:2px solid var(--red);padding-bottom:8px;} .we-page .ohead .logo{height:54px;} .we-page .ohead .who{font-family:'Sofia Sans Condensed',sans-serif;font-size:.86em;color:var(--muted);margin-left:auto;text-align:right;}
  .we-page .otitle{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:var(--green-dark);font-size:1.7em;text-align:center;letter-spacing:3px;margin:22px 0 0;}
  .we-page .odate{text-align:center;color:var(--muted);font-family:'Sofia Sans Condensed',sans-serif;margin:2px 0 14px;}
  .we-page .odecl{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:var(--red);text-align:center;font-size:1.1em;letter-spacing:2px;margin:12px 0 10px;}
  .we-page .frame{border:2px solid var(--green-line);border-radius:10px;padding:28px;display:flex;flex-direction:column;align-items:center;text-align:center;}
  .we-page .ctitle{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:var(--green-dark);font-size:2.4em;letter-spacing:2px;margin:18px 0 2px;}

  /* fillable-form building blocks (Form elements) rendered inside the editor */
  .we-page .ff-opt{display:inline-flex;align-items:center;gap:7px;font-family:'Sofia Sans Condensed',sans-serif;font-size:10pt;margin:4px 14px 4px 0;}
  .we-page .ff-box{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1.6px solid var(--green-dark);border-radius:3px;color:var(--green-dark);font-size:11px;font-weight:700;flex:0 0 auto;}
  .we-page .ff-rb{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1.6px solid var(--green-dark);border-radius:50%;flex:0 0 auto;}
  .we-page .ff-line{display:inline-block;border-bottom:1px solid var(--ink);min-width:220px;padding:0 3px 1px;font-family:'Sofia Sans Condensed',sans-serif;font-size:10pt;line-height:1.4;}
  .we-page .ff-line[data-empty="1"]{border-bottom-color:var(--line);min-height:14px;}
  .we-page .ff-select{font-family:'Sofia Sans Condensed',sans-serif;font-size:10pt;border:1px solid var(--green-dark);border-radius:5px;padding:2px 8px;color:var(--green-dark);background:#fff;cursor:pointer;}
  .we-page .ff-box,.we-page .ff-rb{cursor:pointer;}
  .we-page .ff-box:hover,.we-page .ff-rb:hover{background:var(--green-soft);}
  /* checkbox-option paragraphs — mirror of DOC_CSS p.opt (printed-form look) */
  .we-page p.opt,.we-page li.opt,.we-page p:has(> .ff-box:first-child),.we-page p:has(> .ff-rb:first-child),.we-page p:has(> .ff-opt:first-child){margin:3px 0;padding-left:18px;text-indent:-18px;text-align:justify;line-height:1.32;}
  .we-page .ff-opt,.we-page .ff-box,.we-page .ff-rb{text-indent:0;} /* inherited indent would push ✓/● out of the box */
  /* Tab key inserts a Word-like fixed tab stop */
  .we-page .we-tab{display:inline-block;width:1.25cm;}
  /* inserted formulas (MathML) — hover shows they're editable; double-click opens */
  .we-page .we-f{display:inline-block;padding:0 2px;border-radius:4px;cursor:pointer;}
  .we-page .we-f:hover{background:var(--green-soft);outline:1px dashed var(--green-line);}
  .we-page math{font-size:1.06em;}

  /* text-size selector + text-colour palette */
  .we-size{height:36px;border:1px solid var(--line);background:#fff;border-radius:8px;padding:0 8px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;}
  .we-colorpop{position:absolute;top:calc(100% + 6px);left:0;z-index:50;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 30px rgba(15,30,22,.18);padding:14px;width:236px;}
  .we-sw{width:28px;height:28px;border-radius:7px;border:1px solid rgba(0,0,0,.08);cursor:pointer;padding:0;}
  .we-sw:hover{transform:scale(1.08);}
`;

const IconImage = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.6" fill="var(--green-dark)" stroke="none" />
    <path d="M5.5 17.5 10 13l3 3 3.5-3.5 2.5 2.5" />
  </svg>
);
const IconItems = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" strokeWidth={2} aria-hidden>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8" />
  </svg>
);

export default function WordEditor({
  schemeId,
  docKey,
  docNameEn,
  initialBg,
  initialEn,
  defaultBg,
  defaultEn,
  coverBg = "",
  coverEn = "",
  hasDefault,
  schemeType = "T",
  isForm = false,
  snippets,
  fields,
  formElements = [],
  customItems = [],
  savedTemplates = [],
  copyFrom = [],
  initialReady = false,
}: {
  schemeId: string;
  docKey: string;
  docNameEn: string;
  initialReady?: boolean;
  initialBg: string;
  initialEn: string;
  defaultBg: string;
  defaultEn: string;
  coverBg?: string;
  coverEn?: string;
  hasDefault: boolean;
  schemeType?: "T" | "C";
  isForm?: boolean;
  snippets: Snippet[];
  fields: Field[];
  formElements?: FormEl[];
  customItems?: Snippet[];
  savedTemplates?: Tmpl[];
  copyFrom?: CopyItem[];
}) {
  const { lang: uiLang } = useLang();
  const L = (bg: string, en: string) => (uiLang === "bg" ? bg : en);
  const pageRef = useRef<HTMLDivElement>(null);   // the paper (positioning context for handles)
  const ref = useRef<HTMLDivElement>(null);       // the editable body (.we-docbody)
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [lang, setLang] = useState<"bg" | "en">("bg");
  // Sanitize any HTML that enters the editor from outside this session (saved docs,
  // templates, copied-from-scheme content) so a document authored by one staff member
  // can never run script/handlers in the app origin when another opens it.
  const [bg, setBg] = useState(() => sanitizeDocHtml(initialBg));
  const [en, setEn] = useState(() => sanitizeDocHtml(initialEn));
  const [started, setStarted] = useState(initialBg !== "" || initialEn !== "");
  const [coverIn, setCoverIn] = useState(hasCover(initialBg) || hasCover(initialEn));
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState(initialReady); // "Готов" — the owner's explicit call
  const [panel, setPanel] = useState(true);
  const [expanded, setExpanded] = useState("");
  const [custom, setCustom] = useState<Snippet[]>(customItems);
  const [adding, setAdding] = useState(false);
  const [naym, setNaym] = useState("");
  const [abg, setAbg] = useState("");
  const [aen, setAen] = useState("");
  const [tmpls, setTmpls] = useState<Tmpl[]>(savedTemplates);

  // ── image selection state ──
  const [imgSel, setImgSel] = useState<HTMLImageElement | null>(null);
  const [imgW, setImgW] = useState(0);   // mm
  const [imgH, setImgH] = useState(0);   // mm
  const [wrap, setWrap] = useState<Wrap>("inline");
  const [unit, setUnit] = useState<Unit>("mm");
  const [lockAspect, setLockAspect] = useState(true);
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null); // px rel. to paper
  const [cell, setCell] = useState<HTMLTableCellElement | null>(null); // selected table cell
  const [tblBox, setTblBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null); // outline of the selected cell's table
  const [selEl, setSelEl] = useState<HTMLSelectElement | null>(null); // selected dropdown
  const [selOpts, setSelOpts] = useState(0); // its option count (for the bar)
  const [preview, setPreview] = useState(false);              // inline PDF preview open
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);  // object URL of the rendered PDF
  const pgTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // debounce page-gap reflow
  const [colorOpen, setColorOpen] = useState(false);          // text-colour palette open
  const [textColor, setTextColor] = useState("#9e2b2b");      // last-used text colour (button indicator)
  const colorRef = useRef<HTMLSpanElement>(null);
  const [hiliteOpen, setHiliteOpen] = useState(false);        // highlight (text background) palette open
  const hiliteRef = useRef<HTMLSpanElement>(null);
  const [symOpen, setSymOpen] = useState(false);              // symbol palette (Ω) open
  const symRef = useRef<HTMLSpanElement>(null);
  const [formOpen, setFormOpen] = useState(false);            // formula (√x) popover open
  const [formSrc, setFormSrc] = useState("");                 // linear formula source being edited
  const [formErr, setFormErr] = useState(false);
  const [formEl, setFormEl] = useState<HTMLElement | null>(null); // existing .we-f being re-edited
  // what the text AT THE CARET looks like (font + size) — live, like Word's toolbar
  const [curFmt, setCurFmt] = useState<{ font: string; pt: string } | null>(null);
  const formRef = useRef<HTMLSpanElement>(null);
  const savedRange = useRef<Range | null>(null);              // caret to restore after popover typing
  const lockRef = useRef(lockAspect);
  lockRef.current = lockAspect;
  // Refs mirror the latest saved/busy state so the debounced autosave timer and the
  // beforeunload guard can read current values without being re-created each render.
  // Updated in effects (not during render) so they stay correct after commit.
  const savedRef = useRef(saved);
  const busyRef = useRef(busy);
  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<null | { mode: "resize" | "move"; handle: string; px: number; py: number; w: number; h: number; left: number; top: number; ratio: number }>(null);

  useEffect(() => {
    const fill = () => {
      if (started && ref.current) ref.current.innerHTML = sanitizeDocHtml(lang === "bg" ? bg : en);
    };
    fill();
    // Safety net: dev hydration / double-mount can leave the freshly created div
    // empty even after the line above ran (reopening a SAVED doc showed an empty
    // editor). Re-check shortly after mount and refill only if still untouched.
    const t = setTimeout(() => {
      if (started && ref.current && ref.current.innerHTML.trim() === "") fill();
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const exec = (cmd: string, val?: string) => { ref.current?.focus(); document.execCommand(cmd, false, val); setSaved(false); };
  const insertHtml = (html: string) => { ref.current?.focus(); document.execCommand("insertHTML", false, html); setSaved(false); refreshGuides(); };
  // The page-gap spacers (.we-gap) are presentation only — strip them so the saved
  // / exported HTML is the clean document.
  const current = () => {
    const el = ref.current; if (!el) return "";
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".we-gap").forEach((n) => n.remove());
    return clone.innerHTML;
  };

  // ── inline styling: apply font-size / font-family to the selection, or to the
  // enclosing block when the caret is just sitting in text (like Word) ──
  function applyInlineStyle(prop: "fontSize" | "fontFamily", value: string) {
    const el = ref.current; if (!el) return;
    const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    if (range.collapsed) {
      // Word behaviour: a caret INSIDE a word styles that word; a caret in an
      // empty spot starts a "pending" span so whatever you type next gets the
      // style. (Styling the whole paragraph surprised people — removed.)
      const n = range.startContainer;
      if (n.nodeType === 3) {
        const text = n.textContent ?? "";
        let a = range.startOffset, b = range.startOffset;
        while (a > 0 && /[^\s ]/.test(text[a - 1])) a--;
        while (b < text.length && /[^\s ]/.test(text[b])) b++;
        if (b > a) {
          const wr = document.createRange(); wr.setStart(n, a); wr.setEnd(n, b);
          const span = document.createElement("span"); span.style[prop] = value;
          try { wr.surroundContents(span); }
          catch { span.appendChild(wr.extractContents()); wr.insertNode(span); }
          const cr = document.createRange(); cr.selectNodeContents(span); cr.collapse(false);
          sel.removeAllRanges(); sel.addRange(cr);
          setSaved(false); refreshGuides(); return;
        }
      }
      const span = document.createElement("span"); span.style[prop] = value;
      span.appendChild(document.createTextNode("​")); // zero-width space carries the caret
      range.insertNode(span);
      const cr = document.createRange(); cr.setStart(span.firstChild as Text, 1); cr.collapse(true);
      sel.removeAllRanges(); sel.addRange(cr);
    } else {
      const span = document.createElement("span"); span.style[prop] = value;
      try { range.surroundContents(span); }
      catch { span.appendChild(range.extractContents()); range.insertNode(span); }
      // keep the selection ON the styled text (also makes the caret-format chip
      // and the size box read the NEW value, not the surrounding text's)
      const r = document.createRange(); r.selectNodeContents(span);
      sel.removeAllRanges(); sel.addRange(r);
    }
    setSaved(false); refreshGuides();
  }
  // Any size works, including halves like 13.5 pt (the toolbar box accepts "13,5").
  function applyFontSize(pt: number) { applyInlineStyle("fontSize", pt + "pt"); }
  function applyFont(family: string) { applyInlineStyle("fontFamily", family); }
  // The size box steals focus from the editor, so the selection is remembered on
  // focus and put back right before applying — the value lands on the text you
  // had selected, exactly like Word's size box.
  const sizeRef = useRef<HTMLInputElement | null>(null);
  const sizeRange = useRef<Range | null>(null);
  function applySizeFromBox(raw: string) {
    const v = parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(v) || v < 4 || v > 96) return;
    if (sizeRange.current) {
      ref.current?.focus();
      const s = window.getSelection();
      s?.removeAllRanges(); s?.addRange(sizeRange.current);
    }
    applyFontSize(Math.round(v * 10) / 10);
    if (sizeRef.current) sizeRef.current.value = String(Math.round(v * 10) / 10);
  }
  function bumpFont(delta: number) {
    const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return;
    const n = sel.getRangeAt(0).startContainer;
    const node = n.nodeType === 1 ? (n as HTMLElement) : n.parentElement;
    const px = node ? parseFloat(getComputedStyle(node).fontSize) : 14.67;
    const curPt = Math.round((px * 72) / 96);
    applyFontSize(Math.max(6, Math.min(48, curPt + delta)));
  }

  // ── text colour: apply a colour to the selection (style attr, so it prints) ──
  function applyColor(c: string) {
    ref.current?.focus();
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* not all browsers */ }
    document.execCommand("foreColor", false, c);
    setTextColor(c); setColorOpen(false); setSaved(false);
  }
  // Highlight = colour behind the selected text (Word-like). "transparent" clears it.
  function applyHighlight(c: string) {
    ref.current?.focus();
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* not all browsers */ }
    if (!document.execCommand("hiliteColor", false, c)) document.execCommand("backColor", false, c);
    setHiliteOpen(false); setSaved(false);
  }
  // Fill the selected table cell's background (Word-like). "" clears it.
  function setCellBg(c: string) {
    if (!cell) return;
    cell.style.backgroundColor = c;
    setSaved(false);
  }

  // px size of an image from its inline style (mm) or its rendered box
  function readImgMm(img: HTMLImageElement) {
    const r = img.getBoundingClientRect();
    return { w: roundMm(pxToMm(r.width)), h: roundMm(pxToMm(r.height)) };
  }
  function wrapOf(img: HTMLImageElement): Wrap {
    const s = img.style;
    if (img.classList.contains("free")) return "free";
    if (s.cssFloat === "left") return "left";
    if (s.cssFloat === "right") return "right";
    if (s.display === "block") return "center";
    return "inline";
  }
  // position the selection box + handles over the selected image
  function place() {
    const img = imgSel, page = pageRef.current;
    if (!img || !page) { setBox(null); return; }
    const ir = img.getBoundingClientRect(), pr = page.getBoundingClientRect();
    setBox({ l: ir.left - pr.left, t: ir.top - pr.top, w: ir.width, h: ir.height });
  }
  // Same, but for the table the selected cell belongs to — powers the table's
  // resize outline + corner handle (tables resize like photos: drag or exact %).
  function placeTbl() {
    const tbl = cell?.closest("table"), page = pageRef.current;
    if (!tbl || !page) { setTblBox(null); return; }
    const tr = tbl.getBoundingClientRect(), pr = page.getBoundingClientRect();
    setTblBox({ l: tr.left - pr.left, t: tr.top - pr.top, w: tr.width, h: tr.height });
  }
  // Width as % of the editing surface — mirrors how the photo resize stores mm.
  function setTableWidthPct(pct: number) {
    const tbl = cell?.closest("table");
    if (!tbl || !ref.current) return;
    const p = Math.max(20, Math.min(100, Math.round(pct * 10) / 10));
    (tbl as HTMLTableElement).style.width = p + "%";
    setSaved(false); refreshGuides(); placeTbl();
  }
  function alignTable(a: "left" | "center" | "right") {
    const tbl = cell?.closest("table") as HTMLTableElement | null;
    if (!tbl) return;
    tbl.style.marginLeft = a === "left" ? "0" : "auto";
    tbl.style.marginRight = a === "right" ? "0" : "auto";
    setSaved(false); refreshGuides(); placeTbl();
  }
  function beginTblResize(e: React.PointerEvent) {
    const tbl = cell?.closest("table") as HTMLTableElement | null;
    if (!tbl || !ref.current) return;
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = tbl.getBoundingClientRect().width;
    const pageW = ref.current.getBoundingClientRect().width;
    const move = (ev: PointerEvent) => {
      const w = Math.max(120, Math.min(pageW, startW + (ev.clientX - startX)));
      tbl.style.width = Math.round((w / pageW) * 1000) / 10 + "%";
      placeTbl();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setSaved(false); refreshGuides(); placeTbl();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  // Real page-break gaps: insert a non-editable spacer before any block that would
  // straddle an A4 boundary, pushing it whole to the next page (like the PDF's
  // page-break-inside:avoid) — so text never sits on the break and pages 1/2 are
  // clearly separated. Spacers (.we-gap) are presentation only (stripped on save).
  const GAP_PX = 18; // small grey page-break separation (10–20px); the rest stays white
  const makeGap = (n: number, heightPx: number) => {
    const gap = document.createElement("div");
    gap.className = "we-gap";
    gap.contentEditable = "false";
    gap.style.height = heightPx + "px";
    const sep = document.createElement("div");
    sep.className = "we-gapsep";
    const span = document.createElement("span");
    span.className = "we-gaplabel";
    span.textContent = uiLang === "bg" ? `стр. ${n} / ${n + 1}` : `page ${n} / ${n + 1}`;
    sep.appendChild(span);
    gap.appendChild(sep);
    return gap;
  };
  const isCoverEl = (el: HTMLElement) =>
    el.classList && (el.classList.contains("cover") || el.classList.contains("mcover") || el.classList.contains("mincover"));
  // Insert the page-break spacers. Split into READ → COMPUTE → WRITE phases so we
  // never read layout (offsetTop/offsetHeight) after a write in the same pass — that
  // interleaving is what forced a reflow per block and thrashed on long documents.
  // The cumulative downward shift from inserted gaps is simulated in JS instead of
  // re-measured from the DOM. (`.style.position` avoids a getComputedStyle per child.)
  function refreshGuides() {
    const body = ref.current;
    if (!body) return;
    body.querySelectorAll(":scope > .we-gap").forEach((n) => n.remove());
    const pageH = mmToPx(PAGE_BREAK_MM);
    // READ: one geometry pass over the top-level, in-flow blocks.
    const measured = (Array.from(body.children) as HTMLElement[])
      .filter((c) => c instanceof HTMLElement && c.style.position !== "absolute" && !c.classList.contains("free"))
      .map((el) => ({ el, top: el.offsetTop, h: el.offsetHeight }));
    // COMPUTE: decide every gap using pure math (no DOM reads/writes here).
    const inserts: { before: Node | null; height: number; page: number }[] = [];
    let pageNum = 1;
    let shift = 0;        // total px added by gaps inserted before this point
    let boundary = pageH; // bottom of the current page in the shifted layout
    for (const { el, top: rawTop, h } of measured) {
      const top = rawTop + shift; // where this block will sit after prior gaps
      if (isCoverEl(el)) {
        // the title page always gets its own page — push everything after it to page 2
        const bottom = top + h;
        const remaining = Math.max(0, boundary - bottom);
        inserts.push({ before: el.nextElementSibling, height: remaining + GAP_PX, page: pageNum });
        shift += remaining + GAP_PX;
        pageNum++;
        boundary = bottom + remaining + GAP_PX + pageH;
        continue;
      }
      if (h >= pageH) { boundary = top + Math.ceil(h / pageH) * pageH; continue; } // too tall to push
      if (top + h > boundary) {
        const remaining = Math.max(0, boundary - top); // white space filling the rest of the page
        inserts.push({ before: el, height: remaining + GAP_PX, page: pageNum });
        shift += remaining + GAP_PX;
        pageNum++;
        boundary = top + remaining + GAP_PX + pageH; // next page starts at this block's shifted top
      }
    }
    // WRITE: apply all insertions together.
    for (const ins of inserts) {
      const gap = makeGap(ins.page, ins.height);
      if (ins.before) body.insertBefore(gap, ins.before); else body.appendChild(gap);
    }
  }
  // Debounced reflow for typing (programmatic DOM edits don't fire onInput, so no loop).
  function schedulePaginate() {
    if (pgTimer.current) clearTimeout(pgTimer.current);
    pgTimer.current = setTimeout(() => refreshGuides(), 400);
  }
  // Debounced autosave: persist a few seconds after edits stop, so work is never lost
  // and the owner doesn't have to remember to save. Skips when already saved or while
  // another action is running (the refs hold the latest values, not this closure's).
  function scheduleAutosave() {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      if (!savedRef.current && !busyRef.current) save();
    }, 2500);
  }
  // The editable body's input handler: mark unsaved (only when it flips), reflow the
  // page gaps, and arm the autosave. Guarding setSaved avoids a redundant re-render on
  // every keystroke after the first.
  function onBodyInput() {
    if (savedRef.current) setSaved(false);
    schedulePaginate();
    scheduleAutosave();
  }
  function onEditorKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault(); // Ctrl/⌘+S saves (Ctrl+B/I/U are native in contentEditable)
      if (!savedRef.current && !busyRef.current) save();
    }
    // Tab like Word: in a list = one level in/out; in a table = hop to the
    // next/previous cell; in text = insert a fixed 1.25cm tab stop (Shift+Tab
    // removes the tab stop just before the caret).
    if (e.key === "Tab") {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      const nn = r.startContainer;
      const node = nn.nodeType === 1 ? (nn as HTMLElement) : nn.parentElement;
      const li = node?.closest("li");
      const cellEl = node?.closest("td,th");
      if (li && ref.current?.contains(li)) {
        document.execCommand(e.shiftKey ? "outdent" : "indent");
      } else if (cellEl && ref.current?.contains(cellEl)) {
        const cells = Array.from(cellEl.closest("table")?.querySelectorAll("td,th") ?? []);
        const next = cells[cells.indexOf(cellEl) + (e.shiftKey ? -1 : 1)] as HTMLElement | undefined;
        if (next) {
          const cr = document.createRange(); cr.selectNodeContents(next); cr.collapse(false);
          sel.removeAllRanges(); sel.addRange(cr);
        }
      } else if (e.shiftKey) {
        const inTab = node?.closest(".we-tab");
        let prev: Node | null = null;
        if (r.collapsed && !inTab) {
          if (nn.nodeType === 3 && r.startOffset === 0) prev = nn.previousSibling;
          else if (nn.nodeType === 1) prev = (nn as HTMLElement).childNodes[r.startOffset - 1] ?? null;
          if (prev && prev.nodeType === 3 && !prev.textContent?.trim()) prev = prev.previousSibling;
        }
        if (inTab) inTab.remove();
        else if (prev instanceof HTMLElement && prev.classList.contains("we-tab")) prev.remove();
      } else {
        document.execCommand("insertHTML", false, '<span class="we-tab">&nbsp;</span>');
        // Chrome leaves the caret INSIDE the span — hop it out so typing lands after
        const s2 = window.getSelection();
        const c2 = s2?.rangeCount ? s2.getRangeAt(0).startContainer : null;
        const el2 = c2 ? (c2.nodeType === 1 ? (c2 as HTMLElement) : c2.parentElement) : null;
        const tabEl = el2?.closest?.(".we-tab");
        if (tabEl && s2) {
          const cr = document.createRange(); cr.setStartAfter(tabEl); cr.collapse(true);
          s2.removeAllRanges(); s2.addRange(cr);
        }
      }
      setSaved(false); refreshGuides();
    }
  }
  useEffect(() => { place(); /* eslint-disable-next-line */ }, [imgSel, imgW, imgH, wrap]);
  useEffect(() => { placeTbl(); /* eslint-disable-next-line */ }, [cell]);
  // close the text-colour palette when clicking outside it
  useEffect(() => {
    if (!colorOpen) return;
    const h = (e: MouseEvent) => { if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [colorOpen]);
  useEffect(() => {
    if (!hiliteOpen) return;
    const h = (e: MouseEvent) => { if (hiliteRef.current && !hiliteRef.current.contains(e.target as Node)) setHiliteOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [hiliteOpen]);
  useEffect(() => {
    if (!symOpen) return;
    const h = (e: MouseEvent) => { if (symRef.current && !symRef.current.contains(e.target as Node)) setSymOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [symOpen]);
  useEffect(() => {
    if (!formOpen) return;
    const h = (e: MouseEvent) => { if (formRef.current && !formRef.current.contains(e.target as Node)) { setFormOpen(false); setFormEl(null); setFormErr(false); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [formOpen]);
  // Track the font family + size at the caret/selection so the toolbar always
  // shows what the current text IS — makes keeping sizes consistent easy.
  useEffect(() => {
    const h = () => {
      const sel = window.getSelection();
      const n = sel?.anchorNode ?? null;
      const el = (n && (n.nodeType === 1 ? (n as HTMLElement) : n.parentElement)) ?? null;
      if (!el || !ref.current || !ref.current.contains(el)) { setCurFmt(null); return; }
      const cs = window.getComputedStyle(el);
      const font = (cs.fontFamily.split(",")[0] ?? "").replace(/["']/g, "").trim();
      const pt = Math.round(((parseFloat(cs.fontSize) * 72) / 96) * 10) / 10;
      setCurFmt({ font, pt: String(pt) });
      // the size box mirrors the caret size (like Word) — unless being typed in
      if (sizeRef.current && document.activeElement !== sizeRef.current)
        sizeRef.current.value = String(pt);
    };
    document.addEventListener("selectionchange", h);
    return () => document.removeEventListener("selectionchange", h);
  }, []);
  // free the preview object URL when it changes / on unmount
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  useEffect(() => () => { if (pgTimer.current) clearTimeout(pgTimer.current); if (autoTimer.current) clearTimeout(autoTimer.current); }, []);
  // Warn before leaving with unsaved changes (covers the brief window before autosave
  // fires, and any save that's still in flight).
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (!savedRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);
  useEffect(() => {
    if (!started) return;
    refreshGuides();
    const r = () => { place(); };
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  function selectImg(img: HTMLImageElement) {
    // normalize to explicit mm width/height so resizing + exact size are predictable
    const { w, h } = readImgMm(img);
    if (!img.style.width || img.style.width.endsWith("%")) img.style.width = w + "mm";
    if (!img.style.height) img.style.height = h + "mm";
    setImgSel(img);
    setCell(null);
    setImgW(roundMm(pxToMm(img.getBoundingClientRect().width)));
    setImgH(roundMm(pxToMm(img.getBoundingClientRect().height)));
    setWrap(wrapOf(img));
  }
  function deselect() { setImgSel(null); setBox(null); setSelEl(null); }

  // ── dropdown (select) editing: add / remove / edit its options ──
  function addOption() {
    if (!selEl) return;
    const o = document.createElement("option");
    o.textContent = String(selEl.options.length + 1); // next number (1, 2, 3, 4 …)
    selEl.appendChild(o);
    setSelOpts(selEl.options.length); setSaved(false);
  }
  function removeOption() {
    if (!selEl || selEl.options.length <= 1) return;
    selEl.remove(selEl.options.length - 1);
    setSelOpts(selEl.options.length); setSaved(false);
  }
  function editOptions() {
    if (!selEl) return;
    const cur = Array.from(selEl.options).map((o) => o.textContent ?? "").join(", ");
    const v = window.prompt(L("Опции (разделени със запетая):", "Options (comma-separated):"), cur);
    if (v == null) return;
    selEl.innerHTML = "";
    v.split(",").map((x) => x.trim()).filter(Boolean).forEach((t) => {
      const o = document.createElement("option"); o.textContent = t; selEl!.appendChild(o);
    });
    if (!selEl.options.length) { const o = document.createElement("option"); o.textContent = "1"; selEl.appendChild(o); }
    setSelOpts(selEl.options.length); setSaved(false);
  }
  function removeSelect() { selEl?.remove(); setSelEl(null); setSaved(false); refreshGuides(); }

  function cellOf(el: HTMLElement | null): HTMLTableCellElement | null {
    const td = (el?.closest && el.closest("td,th")) as HTMLTableCellElement | null;
    return td && ref.current?.contains(td) ? td : null;
  }
  function syncCell() {
    const node = window.getSelection()?.anchorNode ?? null;
    const el = (node && node.nodeType === 1 ? (node as HTMLElement) : node?.parentElement) ?? null;
    setCell(cellOf(el));
  }

  function onEditorMouseDown(e: React.MouseEvent) {
    const tgt = e.target as HTMLElement;
    if (tgt && tgt.tagName === "IMG") {
      const img = tgt as HTMLImageElement;
      if (img !== imgSel) selectImg(img);
      // a free image can be dragged to move
      if (img.classList.contains("free")) {
        e.preventDefault();
        const left = parseFloat(img.style.left || "0");
        const top = parseFloat(img.style.top || "0");
        drag.current = { mode: "move", handle: "", px: e.clientX, py: e.clientY, w: 0, h: 0, left, top, ratio: 1 };
        addDrag();
      }
      return;
    }
    const dd = tgt.closest ? (tgt.closest("select.ff-select") as HTMLSelectElement | null) : null;
    if (dd && ref.current?.contains(dd)) {
      e.preventDefault(); // select it for editing instead of opening the native list
      setSelEl(dd); setSelOpts(dd.options.length); setImgSel(null); setBox(null); setCell(null);
      return;
    }
    // Tickboxes & radio marks: click toggles them right in the editor (mirrors how
    // the print/fill side renders them — ✓ for a box, ● for a round mark). A radio
    // click clears its siblings in the same paragraph/cell (one choice per group).
    const mark = tgt.closest ? (tgt.closest(".ff-box, .ff-rb") as HTMLElement | null) : null;
    if (mark && ref.current?.contains(mark)) {
      e.preventDefault();
      if (mark.classList.contains("ff-box")) {
        const on = mark.classList.toggle("on");
        mark.textContent = on ? "✓" : "";
      } else {
        const group = (mark.closest("p, li, td, th") ?? ref.current) as HTMLElement;
        const was = mark.classList.contains("on");
        group.querySelectorAll(".ff-rb").forEach((rb) => { rb.classList.remove("on"); rb.textContent = ""; });
        if (!was) { mark.classList.add("on"); mark.textContent = "●"; } // click again = clear
      }
      setSaved(false);
      return;
    }
    // resize handles (image or table) keep the current selection alive
    if (tgt.classList.contains("we-h")) return;
    deselect();
    setCell(cellOf(tgt));
  }

  // Double-click an inserted formula → reopen the editor with its source.
  function onEditorDoubleClick(e: React.MouseEvent) {
    const f = (e.target as HTMLElement).closest?.(".we-f") as HTMLElement | null;
    if (f && ref.current?.contains(f)) {
      e.preventDefault();
      setFormEl(f); setFormSrc(f.getAttribute("data-f") ?? ""); setFormErr(false); setFormOpen(true);
    }
  }

  // ── formulas (√x) — capture the caret, build MathML, insert / replace ──
  function openFormula() {
    const sel = window.getSelection();
    savedRange.current = sel && sel.rangeCount && ref.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    setFormEl(null); setFormSrc(""); setFormErr(false); setFormOpen(true);
  }
  function insertFormula(srcOverride?: string) {
    const src = (srcOverride ?? formSrc).trim();
    const ml = formulaToMathML(src);
    if (!ml) { setFormErr(true); return; }
    const attr = src.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const html = `<span class="we-f" contenteditable="false" data-f="${attr}">${ml}</span>`;
    if (formEl) {
      formEl.outerHTML = html;
      setSaved(false); refreshGuides();
    } else {
      ref.current?.focus();
      if (savedRange.current) {
        const sel = window.getSelection();
        sel?.removeAllRanges(); sel?.addRange(savedRange.current);
      }
      insertHtml(html + "&nbsp;");
    }
    setFormOpen(false); setFormEl(null); setFormSrc(""); setFormErr(false);
  }
  function insertSymbol(ch: string) {
    exec("insertText", ch);
  }
  // Line spacing for every block the selection touches (1 / 1.15 / 1.5 / 2).
  function applyLineSpacing(v: string) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !ref.current) return;
    const r = sel.getRangeAt(0);
    ref.current.querySelectorAll<HTMLElement>("p, h1, h2, h3, li").forEach((b) => {
      try { if (r.intersectsNode(b)) b.style.lineHeight = v; } catch { /* detached */ }
    });
    setSaved(false);
    if (pageRef.current) refreshGuides();
  }

  // ── table editing: insert + add/remove rows & columns ──
  function bumpTable() { setSaved(false); refreshGuides(); }
  function insertTable() {
    const th = "<th></th>".repeat(3);
    const row = `<tr>${"<td></td>".repeat(3)}</tr>`;
    insertHtml(`<table class="ptable"><thead><tr>${th}</tr></thead><tbody>${row.repeat(3)}</tbody></table><p><br></p>`);
  }
  function addRow(after: boolean) {
    const row = cell?.closest("tr"); if (!row) return;
    const tr = document.createElement("tr");
    for (let i = 0; i < row.children.length; i++) tr.appendChild(document.createElement("td"));
    row.parentElement?.insertBefore(tr, after ? row.nextSibling : row);
    bumpTable();
  }
  function addCol(after: boolean) {
    const table = cell?.closest("table"); if (!cell || !table) return;
    const idx = cell.cellIndex;
    table.querySelectorAll("tr").forEach((tr) => {
      const head = tr.parentElement?.tagName === "THEAD";
      const nc = document.createElement(head ? "th" : "td");
      const refCell = tr.children[idx] ?? null;
      tr.insertBefore(nc, after ? (refCell ? refCell.nextSibling : null) : refCell);
    });
    bumpTable();
  }
  function delRow() {
    const row = cell?.closest("tr"); const table = cell?.closest("table");
    if (!row || !table) return;
    if (table.querySelectorAll("tr").length <= 1) table.remove(); else row.remove();
    setCell(null); bumpTable();
  }
  function delCol() {
    const table = cell?.closest("table"); if (!cell || !table) return;
    const idx = cell.cellIndex;
    const first = table.querySelector("tr");
    if (first && first.children.length <= 1) table.remove();
    else table.querySelectorAll("tr").forEach((tr) => tr.children[idx]?.remove());
    setCell(null); bumpTable();
  }
  function delTable() { cell?.closest("table")?.remove(); setCell(null); bumpTable(); }

  // ── cell merge / split (Word-like) ──
  // Grid column where a cell starts, counting the colSpans of the cells before it.
  // (Like addCol/delCol above, this ignores rowSpans hanging over from earlier rows —
  // fine for the simple document tables; Split always restores a clean grid.)
  function gridCol(c: HTMLTableCellElement): number {
    let col = 0;
    for (let el = c.previousElementSibling; el; el = el.previousElementSibling)
      col += (el as HTMLTableCellElement).colSpan || 1;
    return col;
  }
  // Join a cell's content into the merged cell (skip empty <br> placeholders).
  function foldContent(into: HTMLTableCellElement, from: HTMLTableCellElement) {
    const extra = from.innerHTML.trim();
    if (extra && from.textContent?.trim()) into.innerHTML = into.textContent?.trim() ? into.innerHTML + " " + extra : extra;
  }
  function mergeRight() {
    if (!cell) return;
    const next = cell.nextElementSibling as HTMLTableCellElement | null;
    if (!next || !/^T[DH]$/.test(next.tagName)) return;
    cell.colSpan = (cell.colSpan || 1) + (next.colSpan || 1);
    foldContent(cell, next);
    next.remove();
    bumpTable();
  }
  function mergeDown() {
    if (!cell) return;
    const row = cell.closest("tr"); const table = cell.closest("table");
    if (!row || !table) return;
    const rows = Array.from(table.querySelectorAll("tr"));
    const below = rows[rows.indexOf(row as HTMLTableRowElement) + (cell.rowSpan || 1)];
    if (!below) return;
    // the consecutive cells in the row below that tile EXACTLY the same width as
    // this cell (so a 2-wide merged cell swallows the two 1-wide cells under it)
    const myCol = gridCol(cell); const span = cell.colSpan || 1;
    let col = 0; let eaten = 0; const eat: HTMLTableCellElement[] = [];
    for (const c of Array.from(below.children) as HTMLTableCellElement[]) {
      if (col >= myCol + span) break;
      if (col >= myCol) { eat.push(c); eaten += c.colSpan || 1; }
      col += c.colSpan || 1;
    }
    const rs = eat[0]?.rowSpan || 1;
    if (!eat.length || eaten !== span || eat.some((c) => (c.rowSpan || 1) !== rs)) return;
    cell.rowSpan = (cell.rowSpan || 1) + rs;
    for (const c of eat) { foldContent(cell, c); c.remove(); }
    bumpTable();
  }
  function splitCell() {
    if (!cell) return;
    const row = cell.closest("tr"); const table = cell.closest("table");
    if (!row || !table) return;
    const cs = cell.colSpan || 1, rs = cell.rowSpan || 1;
    if (cs <= 1 && rs <= 1) return;
    const myCol = gridCol(cell);
    const rows = Array.from(table.querySelectorAll("tr"));
    const ri = rows.indexOf(row as HTMLTableRowElement);
    const mk = () => document.createElement(cell.tagName === "TH" ? "th" : "td");
    for (let i = 1; i < cs; i++) row.insertBefore(mk(), cell.nextSibling);
    for (let r = 1; r < rs; r++) {
      const tr = rows[ri + r]; if (!tr) break;
      let col = 0; let ref: Element | null = null;
      for (const c of Array.from(tr.children)) {
        if (col >= myCol) { ref = c; break; }
        col += (c as HTMLTableCellElement).colSpan || 1;
      }
      for (let i = 0; i < cs; i++) tr.insertBefore(mk(), ref);
    }
    cell.removeAttribute("colspan"); cell.removeAttribute("rowspan");
    bumpTable();
  }

  function beginResize(e: React.PointerEvent, handle: string) {
    if (!imgSel) return;
    e.preventDefault();
    e.stopPropagation();
    const r = imgSel.getBoundingClientRect();
    drag.current = {
      mode: "resize", handle, px: e.clientX, py: e.clientY,
      w: r.width, h: r.height, left: 0, top: 0, ratio: r.width / Math.max(1, r.height),
    };
    addDrag();
  }
  function addDrag() {
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
  }
  function onDragMove(e: PointerEvent) {
    const d = drag.current, img = imgSel;
    if (!d || !img) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (d.mode === "move") {
      img.style.left = roundMm(pxToMm(mmToPx(d.left) + dx)) + "mm";
      img.style.top = roundMm(pxToMm(mmToPx(d.top) + dy)) + "mm";
    } else {
      const h = d.handle;
      let w = d.w, hh = d.h;
      if (h.includes("e")) w = d.w + dx;
      if (h.includes("w")) w = d.w - dx;
      if (h.includes("s")) hh = d.h + dy;
      if (h.includes("n")) hh = d.h - dy;
      const corner = h.length === 2;
      if (corner && lockRef.current) hh = w / d.ratio; // keep aspect on corners
      w = Math.max(mmToPx(8), w); hh = Math.max(mmToPx(8), hh);
      // let the image grow to the full content width — older covers carry a baked
      // inline max-width (46%), which would silently cancel the resize
      img.style.maxWidth = "100%";
      img.style.width = roundMm(pxToMm(w)) + "mm";
      img.style.height = roundMm(pxToMm(hh)) + "mm";
    }
    setImgW(roundMm(pxToMm(img.getBoundingClientRect().width)));
    setImgH(roundMm(pxToMm(img.getBoundingClientRect().height)));
    place();
  }
  function onDragEnd() {
    drag.current = null;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    setSaved(false);
    refreshGuides();
  }

  // exact size box (value shown in the chosen unit; stored as mm)
  const toDisplay = (mm: number) => unit === "mm" ? mm : unit === "cm" ? +(mm / 10).toFixed(2) : Math.round(mmToPx(mm));
  const fromDisplay = (v: number) => unit === "mm" ? v : unit === "cm" ? v * 10 : pxToMm(v);
  function applyExact(which: "w" | "h", display: number) {
    if (!imgSel || !Number.isFinite(display) || display <= 0) return;
    const mm = roundMm(fromDisplay(display));
    let w = which === "w" ? mm : imgW;
    let h = which === "h" ? mm : imgH;
    if (lockAspect && imgW > 0 && imgH > 0) {
      const ratio = imgW / imgH;
      if (which === "w") h = roundMm(mm / ratio); else w = roundMm(mm * ratio);
    }
    imgSel.style.maxWidth = "100%"; // clear an older baked cover cap (see onDragMove)
    imgSel.style.width = w + "mm";
    imgSel.style.height = h + "mm";
    setImgW(w); setImgH(h); setSaved(false); place(); refreshGuides();
  }

  function applyWrap(w: Wrap) {
    const img = imgSel;
    if (!img) return;
    const st = img.style;
    img.classList.remove("free");
    st.cssFloat = ""; st.display = ""; st.margin = ""; st.position = ""; st.left = ""; st.top = ""; st.zIndex = "";
    if (w === "left") { st.cssFloat = "left"; st.margin = "4px 12px 8px 0"; }
    else if (w === "right") { st.cssFloat = "right"; st.margin = "4px 0 8px 12px"; }
    else if (w === "center") { st.display = "block"; st.margin = "8px auto"; }
    else if (w === "free") {
      // anchor at its current spot inside the body so it doesn't jump. Measure
      // relative to the editable body (.we-docbody) — the same position:relative
      // wrapper the PDF uses — so the mm coords map 1:1 into the printed document.
      const bodyEl = ref.current!;
      const ir = img.getBoundingClientRect(), br = bodyEl.getBoundingClientRect();
      img.classList.add("free");
      st.left = roundMm(pxToMm(ir.left - br.left)) + "mm";
      st.top = roundMm(pxToMm(ir.top - br.top)) + "mm";
      st.zIndex = "2";
    }
    setWrap(w); setSaved(false); place(); refreshGuides();
  }
  function layer(dir: 1 | -1) {
    if (!imgSel) return;
    const z = parseInt(imgSel.style.zIndex || "1", 10) + dir;
    imgSel.style.zIndex = String(Math.max(1, z));
    setSaved(false);
  }
  function removeImg() { imgSel?.remove(); deselect(); setSaved(false); refreshGuides(); }

  function fold() {
    deselect();
    let cur = current();
    // DATA-LOSS GUARD: an empty editing surface while the state still holds a body
    // means the div was never filled (the mount-fill glitch) — folding would save
    // "" over the real document and autosave would make that permanent. Keep the
    // state's body instead. (A user who really wants an empty doc still has at
    // least an empty <p> in the div, which is not the empty string.)
    const stateBody = lang === "bg" ? bg : en;
    if (cur.trim() === "" && stateBody.trim() !== "") cur = stateBody;
    const nb = lang === "bg" ? cur : bg;
    const ne = lang === "en" ? cur : en;
    setBg(nb); setEn(ne);
    return { nb, ne };
  }
  function switchLang(l: "bg" | "en") {
    if (l === lang) return;
    const { nb, ne } = fold();
    setLang(l);
    if (ref.current) ref.current.innerHTML = sanitizeDocHtml(l === "bg" ? nb : ne);
    setTimeout(refreshGuides, 0);
  }
  // "Готов" toggle — the document only shows as Ready on the scheme page when the
  // owner says so. Any unsaved edits are saved first so the flag matches the content.
  async function toggleReady() {
    setBusy("ready");
    if (!savedRef.current) await save();
    const next = !ready;
    const r = await setDocReadyAction(schemeId, docKey, next);
    setBusy("");
    if (!r?.error) setReady(next);
  }

  // Paste keeps the source formatting: take the clipboard's HTML flavour (another
  // portal document, the print view, Word, the web), unwrap the OS fragment
  // markers, SANITIZE it (same trust boundary as save/load) and insert. Plain-text
  // pastes fall through to the browser default.
  function onEditorPaste(e: React.ClipboardEvent) {
    const html = e.clipboardData?.getData("text/html");
    if (!html) return;
    e.preventDefault();
    let frag = html;
    const m = /<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i.exec(frag);
    if (m) frag = m[1];
    else {
      const b = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(frag);
      if (b) frag = b[1];
    }
    insertHtml(sanitizeDocHtml(frag));
  }

  async function save() {
    const { nb, ne } = fold();
    setBusy("save");
    await saveDocHtmlAction(schemeId, docKey, nb, ne);
    setBusy(""); setSaved(true);
  }
  async function translate() {
    const { nb } = fold();
    setBusy("tr");
    const r = await translateDocHtmlAction(nb);
    setBusy("");
    if (r.error) return alert(L("Превод: ", "Translation: ") + r.error);
    const clean = sanitizeDocHtml(r.html ?? "");
    setEn(clean); setSaved(false);
    if (lang === "en" && ref.current) ref.current.innerHTML = clean;
    else alert(L("Английската чернова е готова — превключете към EN, за да я прегледате/редактирате.", "English draft ready — switch to EN to review/edit it."));
  }
  // Render the current document to a PDF blob (saving first) → object URL.
  async function renderPdfUrl(): Promise<string> {
    const res = await fetch("/api/pdf", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: schemeId, doc: docKey, lang, composed: true }),
    });
    if (!res.ok) throw new Error(await res.text());
    return URL.createObjectURL(await res.blob());
  }
  async function downloadPdf() {
    await save();
    setBusy("pdf");
    try {
      const url = await renderPdfUrl();
      const a = document.createElement("a");
      a.href = url; a.download = `${schemeId}_${docKey}_${lang}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(L("Грешка при PDF: ", "PDF failed: ") + (e as Error).message);
    }
    setBusy("");
  }
  // Lock the document for filling: save the layout, then open the fields-only Fill
  // view (only the form controls stay editable there).
  async function lockToFill() {
    await save();
    window.location.href = `/schemes/${encodeURIComponent(schemeId)}/fill/${encodeURIComponent(docKey)}`;
  }
  // Inline page preview = the real PDF (true pages 1, 2 … with gaps, exactly as
  // downloaded). Editing stays in the continuous view; this is the faithful check.
  async function openPreview() {
    await save();
    setBusy("prev");
    try {
      const url = await renderPdfUrl();
      setPdfUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      setPreview(true);
    } catch (e) {
      alert(L("Грешка при PDF: ", "PDF failed: ") + (e as Error).message);
    }
    setBusy("");
  }
  function closePreview() {
    setPreview(false);
    setPdfUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    setTimeout(refreshGuides, 0);
  }
  // Get a usable image src for insertion: upload the file to storage (so the saved
  // document stays small — a URL, not a multi-MB base64 blob that also duplicates
  // into every revision), falling back to an inline data URL only when storage isn't
  // available (e.g. local dev with no Supabase configured).
  async function uploadOrDataUrl(f: File): Promise<string> {
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await uploadCoverImageAction(fd);
      if (r.url) return r.url;
    } catch { /* fall through to a data URL */ }
    return new Promise<string>((resolve) => {
      const rd = new FileReader();
      rd.onload = () => resolve(String(rd.result));
      rd.onerror = () => resolve("");
      rd.readAsDataURL(f);
    });
  }
  function insertImageAt(src: string) {
    if (!src) return;
    const probe = new Image();
    probe.onload = () => {
      const wmm = 60; // sensible default width
      const hmm = roundMm(wmm * (probe.naturalHeight / Math.max(1, probe.naturalWidth)));
      insertHtml(`<img src="${src}" alt="" style="width:${wmm}mm;height:${hmm}mm">`);
    };
    probe.onerror = () => insertHtml(`<img src="${src}" alt="" style="width:60mm">`);
    probe.src = src;
  }
  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy("img");
    const src = await uploadOrDataUrl(f);
    setBusy("");
    if (!src) return alert(L("Неуспешно добавяне на изображението.", "Could not add the image."));
    insertImageAt(src);
  }
  // Replace the selected image (e.g. swap the cover photo) in place, keeping its
  // size/placement; clears the placeholder look once a real photo is dropped in.
  async function onReplaceImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    const target = imgSel; // capture NOW — the selection may change during the async upload
    e.target.value = "";
    if (!f || !target) return;
    setBusy("img");
    const src = await uploadOrDataUrl(f);
    setBusy("");
    if (!src) return alert(L("Неуспешна смяна на изображението.", "Could not replace the image."));
    target.src = src;
    target.classList.remove("coverimg-empty");
    setSaved(false); place(); refreshGuides();
  }
  function startWith(b: string, e: string) {
    // b/e may come from a saved template or another scheme's document — sanitize.
    const cb = sanitizeDocHtml(b), ce = sanitizeDocHtml(e);
    setBg(cb); setEn(ce); setLang("bg"); setStarted(true); setSaved(false);
    setCoverIn(hasCover(cb) || hasCover(ce));
    // Persist right away — otherwise a started-but-untouched doc vanishes on
    // reload (nothing was ever saved) and the scheme page never shows "Започнат".
    scheduleAutosave();
  }
  // Prepend the document's title page (cover) to an already-started document that
  // doesn't have one yet — so existing docs gain the editable cover without losing
  // their edits. Updates the live language in the DOM and the other in state.
  function addTitlePage() {
    const el = ref.current;
    if (!el) return;
    const covCur = lang === "bg" ? coverBg : coverEn;
    if (covCur && !hasCover(el.innerHTML)) el.innerHTML = covCur + "\n" + el.innerHTML;
    if (lang === "bg") setEn((x) => (coverEn && !hasCover(x) ? coverEn + "\n" + x : x));
    else setBg((x) => (coverBg && !hasCover(x) ? coverBg + "\n" + x : x));
    setCoverIn(true); setSaved(false);
    setTimeout(refreshGuides, 0);
  }

  async function saveAsTemplate() {
    const name = window.prompt(
      L(`Наименувайте този шаблон „${docNameEn}“ (ще се предлага при стартиране на този документ във всяка ${schemeType === "C" ? "калибровъчна" : "изпитвателна"} схема):`,
        `Name this “${docNameEn}” template (it'll be offered when starting this document in any ${schemeType === "C" ? "calibration" : "testing"} scheme):`),
      docNameEn,
    );
    if (name === null) return;
    const { nb, ne } = fold();
    setBusy("tmpl");
    const r = await saveDocTemplateAction(docKey, schemeType, name, nb, ne);
    setBusy("");
    if (r.error) return alert(r.error);
    if (r.item) setTmpls((t) => [...t, { id: r.item!.id, name: r.item!.name, bg: r.item!.bg, en: r.item!.en }]);
    alert(L("Запазено като шаблон.", "Saved as a template."));
  }
  async function deleteTemplate(id: string) {
    if (!window.confirm(L("Да изтрия ли този запазен шаблон?", "Delete this saved template?"))) return;
    setTmpls((t) => t.filter((x) => x.id !== id));
    await deleteDocTemplateAction(id);
  }

  const escapeHtml = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  async function translateAddForm() {
    if (!abg.trim()) return;
    setBusy("addtr");
    const r = await translateAction(abg.trim(), "bg", "en");
    setBusy("");
    if (r.error) return alert(L("Превод: ", "Translation: ") + r.error);
    setAen(r.text ?? "");
  }
  async function saveOwnItem() {
    setBusy("additem");
    const r = await addLibraryItemAction(naym, abg, aen);
    setBusy("");
    if (r.error) return alert(r.error);
    if (r.item) setCustom((c) => [...c, { id: r.item!.id, name: r.item!.name, bg: `<p>${escapeHtml(r.item!.bg)}</p>`, en: `<p>${escapeHtml(r.item!.en || r.item!.bg)}</p>` }]);
    setNaym(""); setAbg(""); setAen(""); setAdding(false);
  }

  function itemCard(idKey: string, label: string, html: string) {
    const open = expanded === idKey;
    return (
      <div key={idKey} className={"we-item" + (open ? " open" : "")}>
        <button onClick={() => setExpanded(open ? "" : idKey)}>
          <span style={{ color: "var(--green-dark)" }}>{open ? "▾" : "▸"}</span> {label}
        </button>
        {open && (
          <div style={{ padding: "0 12px 12px" }}>
            <div className="we-prev" dangerouslySetInnerHTML={{ __html: html || L("<p style='color:#999'>(празно — попълнете го)</p>", "<p style='color:#999'>(empty — fill it in)</p>") }} />
            <button className="btn btn-primary mt-2" style={{ fontSize: 13 }} onClick={() => insertHtml(html)}>{L("Вмъкни ↩", "Insert ↩")}</button>
          </div>
        )}
      </div>
    );
  }

  if (!started) {
    const startRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--line)", borderRadius: 9, padding: "8px 10px" };
    return (
      <>
        <style>{EDITOR_CSS + COVER_CSS}</style>
        <link rel="stylesheet" href={FONTS_HREF} />
        <div className="card p-5" style={{ borderLeft: "4px solid var(--green-dark)", maxWidth: 640 }}>
          <div className="font-bold" style={{ color: "var(--green-dark)", fontSize: 18 }}>{L(`Започни „${docNameEn}“ от…`, `Start “${docNameEn}” from…`)}</div>
          <div className="flex gap-2 mt-4 flex-wrap">
            {hasDefault && <button className="btn btn-primary" onClick={() => startWith(coverBg ? coverBg + "\n" + defaultBg : defaultBg, coverEn ? coverEn + "\n" + defaultEn : defaultEn)}>{L("Шаблон по подразбиране", "Default template")}</button>}
            <button className="btn" onClick={() => startWith("", "")}>{L("＋ Празна страница", "＋ Blank page")}</button>
          </div>

          {tmpls.length > 0 && (
            <div className="mt-5">
              <div className="we-seclabel">{L("ВАШИТЕ ЗАПАЗЕНИ ШАБЛОНИ", "YOUR SAVED TEMPLATES")}</div>
              <div className="mt-2" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tmpls.map((t) => (
                  <div key={t.id} style={startRow}>
                    <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{t.name}</span>
                    <button className="btn" style={{ fontSize: 13, padding: "6px 12px" }} onClick={() => startWith(t.bg, t.en)}>{L("Използвай", "Use")}</button>
                    <button title={L("Изтрий шаблона", "Delete template")} onClick={() => deleteTemplate(t.id)} style={{ border: 0, background: "none", cursor: "pointer", color: "var(--muted)", fontSize: 15, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {copyFrom.length > 0 && (
            <div className="mt-5">
              <div className="we-seclabel">{L("КОПИРАЙ ОТ ПРЕДИШНА СХЕМА", "COPY FROM A PREVIOUS SCHEME")}</div>
              <div className="mt-2" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {copyFrom.map((c) => (
                  <div key={c.id} style={startRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--green-dark)" }}>{c.number}</div>
                      <div className="text-xs" style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                    </div>
                    <button className="btn" style={{ fontSize: 13, padding: "6px 12px" }} onClick={() => startWith(c.bg, c.en)}>{L("Копирай", "Copy")}</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs mt-4" style={{ color: "var(--muted)" }}>
            {L("Можете да редактирате всичко след като започнете. Запазете завършен документ като шаблон за повторна употреба от лентата с инструменти (★ Запази като шаблон).",
               "You can edit everything after you start. Save a finished document as a reusable template from the toolbar (★ Save as template).")}
          </p>
        </div>
      </>
    );
  }

  const tool = (label: React.ReactNode, title: string, fn: () => void) => (
    <button type="button" className="we-tool" title={title} onMouseDown={(e) => e.preventDefault()} onClick={fn}>{label}</button>
  );
  const wrapPill = (w: Wrap, label: string, title: string) => (
    <button type="button" className={"we-pill" + (wrap === w ? " active" : "")} title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => applyWrap(w)}>{label}</button>
  );
  const unitLabel = unit === "mm" ? "мм" : unit === "cm" ? "см" : "px";

  return (
    <div>
      <style>{EDITOR_CSS + COVER_CSS}</style>
      <link rel="stylesheet" href={FONTS_HREF} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onImage} />
      <input ref={replaceRef} type="file" accept="image/*" hidden onChange={onReplaceImage} />

      {/* action bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button className="btn btn-primary" onClick={save} disabled={busy === "save" || saved} title={L("Запази (Ctrl+S)", "Save (Ctrl+S)")}>{busy === "save" ? L("Запазване…", "Saving…") : saved ? L("Запазено ✓", "Saved ✓") : L("Запази", "Save")}</button>
        {/* live save status — the document autosaves a few seconds after you stop editing */}
        <span className="text-sm" style={{ color: saved ? "var(--green-dark)" : "var(--muted)", minWidth: 116, display: "inline-flex", alignItems: "center", gap: 5 }} title={L("Документът се запазва автоматично", "The document autosaves as you work")}>
          {busy === "save" ? L("Запазване…", "Saving…")
            : busy === "img" ? L("Качване на изображение…", "Uploading image…")
            : saved ? L("Всичко е запазено", "All changes saved")
            : L("Незапазени промени", "Unsaved changes")}
        </span>
        {/* the document is only "Готов" on the scheme page when the owner says so */}
        {!isForm && (
          <button
            className="btn"
            onClick={toggleReady}
            disabled={busy === "ready"}
            title={ready
              ? L("Документът е отбелязан като готов — кликнете, за да го върнете в процес", "Marked as ready — click to reopen as in-progress")
              : L("Отбележи документа като готов (показва се като „Готов“ на страницата на схемата)", "Mark the document as ready (shows as “Ready” on the scheme page)")}
            style={ready
              ? { fontSize: 13, background: "#e3eeda", borderColor: "#cbd9be", color: "#456b2c", fontWeight: 700 }
              : { fontSize: 13, borderColor: "var(--green-dark)", color: "var(--green-dark)", fontWeight: 700 }}
          >
            {busy === "ready" ? "…" : ready ? L("Готов ✓", "Ready ✓") : L("✓ Маркирай като готов", "✓ Mark as ready")}
          </button>
        )}
        <span className="we-sep" style={{ height: 20 }} />
        <span className="text-sm" style={{ color: "var(--muted)" }}>{L("Преглед:", "Preview:")}</span>
        {(["bg", "en"] as const).map((l) => (
          <button key={l} className="btn" onClick={() => switchLang(l)} style={lang === l ? { background: "var(--green-soft)", color: "var(--green-dark)", borderColor: "var(--green-line)" } : {}}>{l === "bg" ? "БГ" : "EN"}</button>
        ))}
        <button className="btn" onClick={translate} disabled={busy === "tr"} title={L("Преведи целия документ BG→EN", "Translate the whole document BG→EN")}>{busy === "tr" ? L("Превеждане…", "Translating…") : "⇄ BG → EN"}</button>
        <button className="btn" onClick={downloadPdf} disabled={busy === "pdf"}>{busy === "pdf" ? "…" : "⬇ PDF"}</button>
        <button className="btn" onClick={preview ? closePreview : openPreview} disabled={busy === "prev"}
          style={preview ? { background: "var(--green-soft)", color: "var(--green-dark)", borderColor: "var(--green-line)" } : {}}
          title={L("Виж точните страници (както в PDF)", "See the exact pages (as in the PDF)")}>
          {busy === "prev" ? "…" : preview ? L("✎ Редактиране", "✎ Edit") : L("⤢ Страници", "⤢ Pages")}
        </button>
        {isForm && (
          <button className="btn" onClick={lockToFill} title={L("Заключи документа за попълване — само полетата остават редактируеми", "Lock the document for filling — only the fields stay editable")} style={{ borderColor: "var(--green-line)", color: "var(--green-dark)" }}>{L("Заключи (попълване)", "Lock (fill)")}</button>
        )}
        {!coverIn && (coverBg || coverEn) && (
          <button className="btn" onClick={addTitlePage} title={L("Добави заглавна страница (корица) към този документ", "Add the title page (cover) to this document")} style={{ borderColor: "var(--green-line)", color: "var(--green-dark)" }}>{L("＋ Заглавна страница", "＋ Title page")}</button>
        )}
        <button className="btn" onClick={saveAsTemplate} disabled={busy === "tmpl"} title={L("Запази този документ като шаблон за повторна употреба за този тип схема", "Save this document as a reusable template for this scheme type")}>{busy === "tmpl" ? "…" : L("★ Запази като шаблон", "★ Save as template")}</button>
        <button className="btn ml-auto" onClick={() => setPanel((p) => !p)}>{panel ? L("Елементи ▸", "Items ▸") : L("Елементи ◂", "Items ◂")}</button>
      </div>

      <div className="we-stickyhead">
      {/* formatting toolbar */}
      {!preview && (
      <div className="we-toolbar mb-3">
        {tool("B", L("Получер", "Bold"), () => exec("bold"))}
        {tool(<span style={{ fontStyle: "italic" }}>I</span>, L("Курсив", "Italic"), () => exec("italic"))}
        {tool(<span style={{ textDecoration: "underline" }}>U</span>, L("Подчертан", "Underline"), () => exec("underline"))}
        {tool(<span style={{ textDecoration: "line-through" }}>S</span>, L("Зачертан", "Strikethrough"), () => exec("strikeThrough"))}
        {tool(<span>x<sup style={{ fontSize: 9 }}>2</sup></span>, L("Горен индекс", "Superscript"), () => exec("superscript"))}
        {tool(<span>x<sub style={{ fontSize: 9 }}>2</sub></span>, L("Долен индекс", "Subscript"), () => exec("subscript"))}
        <span className="we-sep" />
        {tool("H2", L("Заглавие", "Heading"), () => exec("formatBlock", "h2"))}
        {tool("¶", L("Нормален текст", "Normal text"), () => exec("formatBlock", "p"))}
        <span className="we-sep" />
        {tool(L("•  Списък", "•  List"), L("Списък с водещи символи", "Bullet list"), () => exec("insertUnorderedList"))}
        {tool(L("1.  Списък", "1.  List"), L("Номериран списък", "Numbered list"), () => exec("insertOrderedList"))}
        {tool("⇤", L("Намали отстъпа", "Decrease indent"), () => exec("outdent"))}
        {tool("⇥", L("Увеличи отстъпа", "Increase indent"), () => exec("indent"))}
        <span className="we-sep" />
        {tool(alignIcon("left"), L("Подравняване вляво", "Align left"), () => exec("justifyLeft"))}
        {tool(alignIcon("center"), L("Центрирано", "Align centre"), () => exec("justifyCenter"))}
        {tool(alignIcon("right"), L("Подравняване вдясно", "Align right"), () => exec("justifyRight"))}
        {tool(alignIcon("full"), L("Двустранно подравняване", "Justify"), () => exec("justifyFull"))}
        <select
          className="we-size"
          title={L("Междуредие", "Line spacing")}
          defaultValue=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => { if (e.target.value) applyLineSpacing(e.target.value); e.currentTarget.selectedIndex = 0; }}
        >
          <option value="" disabled>{L("Междуредие", "Spacing")}</option>
          {["1", "1.15", "1.5", "2"].map((n) => (<option key={n} value={n}>{n}</option>))}
        </select>
        <span className="we-sep" />
        {/* font family — applies to the selection (or the block at the caret) */}
        <select
          className="we-size"
          title={L("Шрифт", "Font")}
          defaultValue=""
          style={{ maxWidth: 150 }}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => { if (e.target.value) applyFont(e.target.value); e.currentTarget.selectedIndex = 0; }}
        >
          <option value="" disabled>{L("Шрифт", "Font")}</option>
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.css} style={{ fontFamily: f.css }}>{f.label}</option>
          ))}
        </select>
        {tool("A−", L("По-малък текст", "Smaller text"), () => bumpFont(-1))}
        {tool("A+", L("По-голям текст", "Bigger text"), () => bumpFont(1))}
        {/* size — shows the size at the caret; type ANY value (13,5 works) and
            press Enter, or pick a preset from the list */}
        <input
          ref={sizeRef}
          className="we-size"
          list="we-size-list"
          inputMode="decimal"
          placeholder={L("Размер", "Size")}
          title={L("Размер в pt — напишете стойност (напр. 13,5) и натиснете Enter", "Size in pt — type a value (e.g. 13.5) and press Enter")}
          style={{ width: 74 }}
          onMouseDown={(e) => e.stopPropagation()}
          onFocus={(e) => {
            // remember the editor selection before the box takes focus
            const s = window.getSelection();
            if (s && s.rangeCount > 0 && ref.current?.contains(s.getRangeAt(0).commonAncestorContainer))
              sizeRange.current = s.getRangeAt(0).cloneRange();
            e.currentTarget.select();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            applySizeFromBox(e.currentTarget.value);
          }}
          onChange={(e) => {
            // apply immediately ONLY when a preset is picked from the dropdown —
            // plain typing waits for Enter (so "13,5" can be typed without "13"
            // firing halfway through)
            if ((e.nativeEvent as InputEvent).inputType === "insertReplacementText")
              applySizeFromBox(e.currentTarget.value);
          }}
        />
        <datalist id="we-size-list">
          {TEXT_SIZES.map((n) => (<option key={n} value={n} />))}
        </datalist>
        {/* live indicator: the font + size of the text at the caret (like Word) */}
        {curFmt && (
          <span
            title={L("Шрифт и размер на текста при курсора", "Font and size of the text at the caret")}
            style={{ fontSize: 11.5, fontWeight: 700, color: "var(--green-dark)", background: "#fff", border: "1px solid var(--green-line)", borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
          >
            {curFmt.font} · {curFmt.pt} pt
          </span>
        )}
        {/* text colour palette */}
        <span ref={colorRef} style={{ position: "relative", display: "inline-flex" }}>
          <button type="button" className="we-tool" title={L("Цвят на текста", "Text colour")} style={{ gap: 3 }} onMouseDown={(e) => e.preventDefault()} onClick={() => setColorOpen((o) => !o)}>
            <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>A</span>
              <span style={{ width: 15, height: 4, borderRadius: 1, background: textColor, marginTop: 1 }} />
            </span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>▾</span>
          </button>
          {colorOpen && (
            <div className="we-colorpop">
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 8 }}>{L("Цвят на текста", "Text colour")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
                {TEXT_COLORS.map((c) => (
                  <button key={c} type="button" className="we-sw" title={c} style={{ background: c, borderColor: c === "#ffffff" ? "#ccc" : "rgba(0,0,0,.08)" }} onMouseDown={(e) => e.preventDefault()} onClick={() => applyColor(c)} />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <button type="button" className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={() => applyColor("#1a1a1a")}>
                  <span style={{ width: 12, height: 12, borderRadius: 999, background: "#1a1a1a", display: "inline-block" }} /> {L("Автоматичен", "Automatic")}
                </button>
                <label className="we-pill" style={{ marginLeft: "auto", position: "relative", overflow: "hidden" }} onMouseDown={(e) => e.preventDefault()}>
                  ＋ {L("Друг", "Custom")}
                  <input type="color" onChange={(e) => applyColor(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                </label>
              </div>
            </div>
          )}
        </span>
        {/* highlight (text background) palette */}
        <span ref={hiliteRef} style={{ position: "relative", display: "inline-flex" }}>
          <button type="button" className="we-tool" title={L("Маркер (фон зад текста)", "Highlight (colour behind text)")} style={{ gap: 3 }} onMouseDown={(e) => e.preventDefault()} onClick={() => setHiliteOpen((o) => !o)}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 19, height: 19, borderRadius: 3, background: "#fff3a3", fontWeight: 800, fontSize: 13, color: "#1a1a1a" }}>A</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>▾</span>
          </button>
          {hiliteOpen && (
            <div className="we-colorpop">
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 8 }}>{L("Маркер (фон зад текста)", "Highlight")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
                {HILITE_COLORS.map((c) => (
                  <button key={c} type="button" className="we-sw" title={c} style={{ background: c, borderColor: "rgba(0,0,0,.08)" }} onMouseDown={(e) => e.preventDefault()} onClick={() => applyHighlight(c)} />
                ))}
              </div>
              <button type="button" className="we-pill" style={{ marginTop: 10 }} onMouseDown={(e) => e.preventDefault()} onClick={() => applyHighlight("transparent")}>✕ {L("Без маркер", "No highlight")}</button>
            </div>
          )}
        </span>
        <span className="we-sep" />
        {/* symbol palette */}
        <span ref={symRef} style={{ position: "relative", display: "inline-flex" }}>
          <button type="button" className="we-tool" title={L("Символи", "Symbols")} style={{ gap: 3 }} onMouseDown={(e) => e.preventDefault()} onClick={() => setSymOpen((o) => !o)}>
            Ω <span style={{ fontSize: 11, color: "var(--muted)" }}>▾</span>
          </button>
          {symOpen && (
            <div className="we-colorpop" style={{ width: 250 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 8 }}>{L("Символи", "Symbols")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 4 }}>
                {SYMBOLS.map((ch) => (
                  <button key={ch} type="button" className="we-tool" style={{ justifyContent: "center", padding: "3px 0", fontSize: 14 }}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => insertSymbol(ch)}>{ch}</button>
                ))}
              </div>
            </div>
          )}
        </span>
        {/* formula (equation) */}
        <span ref={formRef} style={{ position: "relative", display: "inline-flex" }}>
          <button type="button" className="we-tool" title={L("Формула", "Formula")} style={{ gap: 3 }} onMouseDown={(e) => e.preventDefault()} onClick={() => (formOpen ? setFormOpen(false) : openFormula())}>
            √x <span style={{ fontSize: 11, color: "var(--muted)" }}>▾</span>
          </button>
          {formOpen && (
            <div className="we-colorpop" style={{ width: 360 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 6 }}>
                {formEl ? L("Редакция на формула", "Edit formula") : L("Формула", "Formula")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8, maxHeight: 168, overflowY: "auto" }}>
                {PT_FORMULAS.map((f) => (
                  <button key={f.id} type="button" className="we-pill" style={{ justifyContent: "space-between", width: "100%", gap: 10 }}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => { setFormSrc(f.src); setFormErr(false); }}>
                    <span style={{ fontSize: 11.5, textAlign: "left" }}>{L(f.nameBg, f.nameEn)}</span>
                    <span style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: formulaToMathML(f.src) ?? "" }} />
                  </button>
                ))}
              </div>
              <input
                value={formSrc}
                onChange={(e) => { setFormSrc(e.target.value); setFormErr(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertFormula(); } }}
                placeholder="z = (x_i − x_pt) / σ_pt"
                style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 7, padding: "5px 8px", fontSize: 13, fontFamily: "ui-monospace, monospace" }}
              />
              <div style={{ minHeight: 34, display: "flex", alignItems: "center", justifyContent: "center", margin: "8px 0", padding: "4px 8px", background: "#fff", border: "1px dashed var(--line)", borderRadius: 7, fontSize: 16 }}>
                {formSrc.trim()
                  ? (formulaToMathML(formSrc)
                      ? <span dangerouslySetInnerHTML={{ __html: formulaToMathML(formSrc)! }} />
                      : <span style={{ fontSize: 12, color: "var(--red, #a04545)" }}>{L("Непълна формула — проверете скобите", "Incomplete formula — check the brackets")}</span>)
                  : <span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Преглед на формулата", "Formula preview")}</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
                {L("Синтаксис: / дроб · sqrt( ) корен · x_1 индекс · x^2 степен · гръцки от Ω", "Syntax: / fraction · sqrt( ) root · x_1 subscript · x^2 power · greek via Ω")}
              </div>
              <button type="button" className="btn btn-primary btn-sm" style={{ width: "100%" }}
                onMouseDown={(e) => e.preventDefault()} onClick={() => insertFormula()} disabled={!formSrc.trim()}>
                {formEl ? L("Запази формулата", "Save formula") : L("Вмъкни формулата", "Insert formula")}
              </button>
            </div>
          )}
        </span>
        {tool(L("Изображение", "Image"), L("Вмъкни изображение / лого", "Insert image / logo"), () => fileRef.current?.click())}
        {tool(L("▦ Таблица", "▦ Table"), L("Вмъкни таблица", "Insert table"), insertTable)}
        <span className="we-sep" />
        {tool("↶", L("Отмени", "Undo"), () => exec("undo"))}
        {tool("↷", L("Върни", "Redo"), () => exec("redo"))}
        <span className="text-xs" style={{ marginLeft: "auto", color: "var(--muted)" }}>{L("Редактиране:", "Editing:")} <b style={{ color: "var(--green-dark)" }}>{lang === "bg" ? L("Български", "Bulgarian") : L("Английски", "English")}</b></span>
      </div>
      )}

      {/* contextual controls — pinned in the top toolbar area so they never cover the page */}
      {!preview && imgSel && (
        <div className="we-imgbar">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, color: "var(--ink)" }}><IconImage /> {L("Изображение", "Image")}</span>
          <span className="grp">
            <input className="we-num" type="number" min={1} value={toDisplay(imgW)} onChange={(e) => applyExact("w", parseFloat(e.target.value))} />
            <span className="text-xs" style={{ color: "var(--muted)" }}>{unitLabel} {L("Ш", "W")}</span>
            <span style={{ color: "var(--muted)" }}>×</span>
            <input className="we-num" type="number" min={1} value={toDisplay(imgH)} onChange={(e) => applyExact("h", parseFloat(e.target.value))} />
            <span className="text-xs" style={{ color: "var(--muted)" }}>{unitLabel} {L("В", "H")}</span>
          </span>
          <div className="we-unit">
            {(["mm", "cm", "px"] as Unit[]).map((u) => (
              <button key={u} className={unit === u ? "active" : ""} onClick={() => setUnit(u)}>{u}</button>
            ))}
          </div>
          <button className={"we-pill" + (lockAspect ? " active" : "")} title={L("Заключи съотношението", "Lock aspect ratio")} onClick={() => setLockAspect((v) => !v)}>{lockAspect ? "🔒" : "🔓"} {L("Съотношение", "Aspect")}</button>
          <span className="we-sep" />
          {wrapPill("inline", L("В реда", "In line"), L("В реда с текста", "Inline with text"))}
          {wrapPill("left", L("Ляво", "Left"), L("Текстът обтича отдясно", "Text wraps right"))}
          {wrapPill("right", L("Дясно", "Right"), L("Текстът обтича отляво", "Text wraps left"))}
          {wrapPill("center", L("Център", "Centre"), L("Центрирай", "Centre"))}
          {wrapPill("free", L("Свободно (върху текста)", "Free (over text)"), L("Постави свободно — може да се припокрива", "Place freely — can overlap"))}
          {wrap === "free" && (
            <>
              <button className="we-pill" title={L("Премести напред", "Bring forward")} onClick={() => layer(1)}>↑ {L("Напред", "Forward")}</button>
              <button className="we-pill" title={L("Премести назад", "Send back")} onClick={() => layer(-1)}>↓ {L("Назад", "Back")}</button>
            </>
          )}
          <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={() => replaceRef.current?.click()}>⟳ {L("Смени снимката", "Replace")}</button>
          <button className="we-pill danger" onMouseDown={(e) => e.preventDefault()} onClick={removeImg}>✕ {L("Премахни", "Remove")}</button>
        </div>
      )}

      {!preview && cell && !imgSel && (
        <div className="we-imgbar">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>▦ {L("Таблица", "Table")}</span>
          <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={() => addRow(false)}>↥ {L("Ред отгоре", "Row above")}</button>
          <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={() => addRow(true)}>↧ {L("Ред отдолу", "Row below")}</button>
          <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={() => addCol(false)}>↤ {L("Колона отляво", "Column left")}</button>
          <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={() => addCol(true)}>↦ {L("Колона отдясно", "Column right")}</button>
          <span className="we-sep" />
          <button className="we-pill" title={L("Обедини клетката със съседната вдясно", "Merge the cell with the one to its right")} onMouseDown={(e) => e.preventDefault()} onClick={mergeRight}>⧉ {L("Обедини вдясно", "Merge right")}</button>
          <button className="we-pill" title={L("Обедини клетката с тази под нея", "Merge the cell with the one below it")} onMouseDown={(e) => e.preventDefault()} onClick={mergeDown}>⧉ {L("Обедини надолу", "Merge down")}</button>
          <button className="we-pill" title={L("Върни обединената клетка към отделни клетки", "Split a merged cell back into single cells")} onMouseDown={(e) => e.preventDefault()} onClick={splitCell}>⊞ {L("Раздели", "Split")}</button>
          <span className="we-sep" />
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{L("Ширина", "Width")}</span>
          <input
            className="we-size we-tblw"
            inputMode="decimal"
            key={(cell.closest("table") as HTMLTableElement | null)?.style.width || "100%"}
            defaultValue={(() => { const t = cell.closest("table") as HTMLTableElement | null; const w = t?.style.width; return w?.endsWith("%") ? w.slice(0, -1) : "100"; })()}
            title={L("Ширина на таблицата в % от страницата (20–100) — Enter прилага; или влачете ъгъла на таблицата", "Table width as % of the page (20–100) — Enter applies; or drag the table corner")}
            style={{ width: 56 }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const v = parseFloat(e.currentTarget.value.replace(",", "."));
              if (Number.isFinite(v)) setTableWidthPct(v);
            }}
          />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>%</span>
          <button className="we-pill" title={L("Таблицата вляво", "Table to the left")} onMouseDown={(e) => e.preventDefault()} onClick={() => alignTable("left")}>⇤</button>
          <button className="we-pill" title={L("Таблицата в средата", "Table centred")} onMouseDown={(e) => e.preventDefault()} onClick={() => alignTable("center")}>⇹</button>
          <button className="we-pill" title={L("Таблицата вдясно", "Table to the right")} onMouseDown={(e) => e.preventDefault()} onClick={() => alignTable("right")}>⇥</button>
          <span className="we-sep" />
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{L("Фон", "Fill")}</span>
          <span className="we-swrow">
            {CELL_COLORS.map((c) => (
              <button key={c} type="button" className="we-sw-sm" title={L("Цвят на клетката", "Cell colour")} style={{ background: c, borderColor: c === "#ffffff" ? "#ccc" : "rgba(0,0,0,.12)" }} onMouseDown={(e) => e.preventDefault()} onClick={() => setCellBg(c)} />
            ))}
            <button type="button" className="we-pill" style={{ fontSize: 12, padding: "3px 9px" }} onMouseDown={(e) => e.preventDefault()} onClick={() => setCellBg("")}>{L("Изчисти", "Clear")}</button>
          </span>
          <span className="we-sep" />
          <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={delRow}>{L("Изтрий реда", "Delete row")}</button>
          <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={delCol}>{L("Изтрий колоната", "Delete column")}</button>
          <button className="we-pill danger" onMouseDown={(e) => e.preventDefault()} onClick={delTable}>✕ {L("Изтрий таблицата", "Delete table")}</button>
        </div>
      )}

      {!preview && selEl && (
        <div className="we-imgbar">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>▾ {L("Падащо меню", "Dropdown")}</span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>{selOpts} {L("опции", "options")}</span>
          <span className="we-sep" />
          <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={addOption}>＋ {L("Добави опция", "Add option")}</button>
          <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={removeOption}>− {L("Премахни последната", "Remove last")}</button>
          <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={editOptions}>✎ {L("Редактирай опциите", "Edit options")}</button>
          <span className="we-sep" />
          <button className="we-pill danger" onMouseDown={(e) => e.preventDefault()} onClick={removeSelect}>✕ {L("Премахни", "Remove")}</button>
        </div>
      )}
      </div>

      {preview && pdfUrl ? (
        <div className="we-preview">
          <iframe title={L("Преглед на страниците", "Page preview")} src={pdfUrl} />
        </div>
      ) : (
      <div className="we-body">
        <div className="we-col">
          <div ref={pageRef} className="we-page" onMouseDown={onEditorMouseDown} onDoubleClick={onEditorDoubleClick}>
            <div
              ref={ref}
              className="we-docbody"
              contentEditable
              suppressContentEditableWarning
              onInput={onBodyInput}
              onKeyDown={onEditorKeyDown}
              onKeyUp={syncCell}
              onPaste={onEditorPaste}
            />
            {/* selection handles */}
            {imgSel && box && (
              <div className="we-ov">
                <div className="we-selbox" style={{ left: box.l, top: box.t, width: box.w, height: box.h }} />
                {([
                  ["nw", box.l, box.t], ["n", box.l + box.w / 2, box.t], ["ne", box.l + box.w, box.t],
                  ["w", box.l, box.t + box.h / 2], ["e", box.l + box.w, box.t + box.h / 2],
                  ["sw", box.l, box.t + box.h], ["s", box.l + box.w / 2, box.t + box.h], ["se", box.l + box.w, box.t + box.h],
                ] as [string, number, number][]).map(([h, x, y]) => (
                  <div key={h} className={"we-h " + h} style={{ left: x - 5.5, top: y - 5.5 }} onPointerDown={(e) => beginResize(e, h)} />
                ))}
              </div>
            )}
            {/* table resize: outline + SE corner handle (drag ⇄ width %, like photos) */}
            {cell && !imgSel && tblBox && !preview && (
              <div className="we-ov">
                <div className="we-selbox" style={{ left: tblBox.l, top: tblBox.t, width: tblBox.w, height: tblBox.h }} />
                <div
                  className="we-h se"
                  title={L("Влачете за ширина на таблицата", "Drag to resize the table width")}
                  style={{ left: tblBox.l + tblBox.w - 5.5, top: tblBox.t + tblBox.h - 5.5 }}
                  onPointerDown={beginTblResize}
                />
              </div>
            )}
          </div>
        </div>

        {panel && (
          <aside className="we-panel">
            <div className="we-panelhdr">
              <IconItems />
              <span className="ttl">{L("Елементи", "Items")}</span>
              <button className="we-collapse" title={L("Скрий панела", "Hide panel")} onClick={() => setPanel(false)}>▸</button>
            </div>

            <div className="we-seclabel" style={{ margin: "8px 0 4px" }}>{L("АВТО-ПОЛЕТА", "AUTO-FIELDS")}</div>
            {fields.map((f) => itemCard(`f:${f.key}`, f.label, lang === "bg" ? f.bg : f.en))}

            {/* snippets, form elements and own items grouped by the document they
                serve (Общи · План · Заявка · Лист с резултати · Доклад …) so it's
                obvious at a glance which element belongs where. */}
            <div className="we-seclabel" style={{ margin: "14px 0 4px" }}>{L("ФРАГМЕНТИ", "SNIPPETS")}</div>
            {groupByCategory(snippets, (s) => s.category || "General", (s) => s.name).map(([cat, list]) => (
              <div key={cat}>
                <div className="we-subsec">{categoryLabel(cat, uiLang)}</div>
                {list.map((s) => itemCard(`s:${s.id}`, s.name, lang === "bg" ? s.bg : s.en))}
              </div>
            ))}

            {formElements.length > 0 && <div className="we-seclabel" style={{ margin: "14px 0 4px" }}>{L("ЕЛЕМЕНТИ ЗА ФОРМУЛЯР", "FORM ELEMENTS")}</div>}
            {groupByCategory(formElements, (e) => e.category || "Form", (e) => (uiLang === "bg" ? e.nameBg : e.nameEn)).map(([cat, list]) => (
              <div key={cat}>
                <div className="we-subsec">{categoryLabel(cat, uiLang)}</div>
                {list.map((e) => itemCard(`fe:${e.id}`, uiLang === "bg" ? e.nameBg : e.nameEn, lang === "bg" ? e.bg : e.en))}
              </div>
            ))}

            {custom.length > 0 && <div className="we-seclabel" style={{ margin: "14px 0 4px", color: "var(--gold)" }}>{L("МОИ ЕЛЕМЕНТИ", "MY ITEMS")}</div>}
            {groupByCategory(custom, (c) => c.category, (c) => c.name).map(([cat, list]) => (
              <div key={cat}>
                {custom.length > list.length || cat !== "My items" ? <div className="we-subsec">{categoryLabel(cat, uiLang)}</div> : null}
                {list.map((c) => itemCard(`c:${c.id}`, c.name, lang === "bg" ? c.bg : c.en))}
              </div>
            ))}

            <div className="mt-3">
              {adding ? (
                <div className="card p-3" style={{ background: "var(--green-soft)", borderColor: "var(--green-line)" }}>
                  <input placeholder={L("Име на елемента", "Item name")} value={naym} onChange={(e) => setNaym(e.target.value)} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px", fontSize: 13, marginBottom: 6 }} />
                  <textarea placeholder={L("Текст (български)", "Text (Bulgarian)")} value={abg} onChange={(e) => setAbg(e.target.value)} rows={3} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px", fontSize: 13 }} />
                  <button className="btn mt-2" style={{ fontSize: 12, padding: "5px 12px" }} onClick={translateAddForm} disabled={busy === "addtr"}>{busy === "addtr" ? "…" : "⇄ БГ → EN"}</button>
                  <textarea placeholder={L("Текст (английски)", "Text (English)")} value={aen} onChange={(e) => setAen(e.target.value)} rows={3} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px", fontSize: 13, marginTop: 6 }} />
                  <div className="flex gap-2 mt-2">
                    <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={saveOwnItem} disabled={busy === "additem"}>{busy === "additem" ? L("Запазване…", "Saving…") : L("Запази елемента", "Save item")}</button>
                    <button className="btn" style={{ fontSize: 13 }} onClick={() => setAdding(false)}>{L("Отказ", "Cancel")}</button>
                  </div>
                </div>
              ) : (
                <button className="we-addown" onClick={() => setAdding(true)}>{L("＋  Добави собствен елемент", "＋  Add your own item")}</button>
              )}
            </div>

            <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>{L("Кликнете върху елемент, за да го прегледате, след това Вмъкни.", "Click an item to preview it, then Insert.")}</p>
          </aside>
        )}
      </div>
      )}
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        {preview
          ? L("Това е точният PDF — страница 1, 2 … с реалните полета между тях. Натиснете „✎ Редактиране“, за да се върнете.",
               "This is the exact PDF — page 1, 2 … with the real gaps between them. Press “✎ Edit” to go back.")
          : L("Страницата е A4 — текстът се пренася на нова страница при всяко прекъсване. Натиснете „⤢ Страници“, за да видите точните страници като в PDF.",
               "The page is A4 — text moves to a new page at each break. Press “⤢ Pages” to see the exact pages as in the PDF.")}
      </p>
    </div>
  );
}
