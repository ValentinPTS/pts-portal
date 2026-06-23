"use client";

import { useEffect, useRef, useState } from "react";
import { saveDocHtmlAction, translateDocHtmlAction, translateAction, addLibraryItemAction, saveDocTemplateAction, deleteDocTemplateAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";
import { FONTS_HREF } from "@/lib/doc-css";

type Snippet = { id: string; name: string; bg: string; en: string };
type Field = { key: string; label: string; bg: string; en: string };
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

const EDITOR_CSS = `
  .we-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;background:var(--green-soft);border:1px solid var(--green-line);border-radius:10px;}
  .we-tool{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:36px;padding:0 11px;border:1px solid var(--line);background:#fff;border-radius:8px;cursor:pointer;font-weight:700;font-size:15px;color:var(--ink);transition:background .12s,border-color .12s;}
  .we-tool:hover{background:var(--green-soft);border-color:var(--green-line);}
  .we-sep{width:1px;height:24px;background:var(--green-line);margin:0 3px;}

  .we-body{display:flex;gap:24px;align-items:flex-start;background:var(--canvas);border:1px solid var(--line);border-radius:14px;padding:28px;}
  .we-col{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:16px;overflow:auto;}

  /* the paper = exactly the PDF content box (182mm), real document body styles */
  .we-page{--green-dark:#5f7d52;--green:#88a77b;--green-soft:#eef3ea;--green-line:#b7d0c0;--red:#9e2b2b;--ink:#1a1a1a;--muted:#6b6b6b;--line:#dcdcdc;position:relative;width:${PAGE_W_MM}mm;color:var(--ink);border:1px solid var(--line);border-radius:4px;
    padding:26px 30px 50px;box-shadow:0 8px 28px rgba(15,30,22,.10);
    font-family:'PT Serif',Georgia,serif;font-size:11pt;line-height:1.5;
    background:repeating-linear-gradient(to bottom,
      #fff 0, #fff calc(${PAGE_BREAK_MM}mm - 0.5px),
      var(--line) calc(${PAGE_BREAK_MM}mm - 0.5px), var(--line) ${PAGE_BREAK_MM}mm,
      var(--canvas,#eef1ee) ${PAGE_BREAK_MM}mm, var(--canvas,#eef1ee) calc(${PAGE_BREAK_MM}mm + 16px));}
  .we-docbody{position:relative;min-height:55vh;outline:none;}
  .we-docbody:focus{outline:none;}
  .we-page.focused{box-shadow:0 8px 28px rgba(15,30,22,.12),0 0 0 2px var(--green-light);}
  .we-page h2{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:13.5pt;color:var(--ink);border-bottom:2.5px solid var(--red);padding-bottom:5px;margin:20px 0 4px;}
  .we-page h3{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:11.5pt;color:var(--green-dark);margin:12px 0 3px;}
  .we-page p{margin:6px 0;}
  .we-page ul,.we-page ol{margin:6px 0 6px 0;padding-left:26px;}
  .we-page ul{list-style:disc;} .we-page ol{list-style:decimal;}
  .we-page ul ul,.we-page ol ol,.we-page ul ol,.we-page ol ul{margin:2px 0;}
  .we-page li{margin:3px 0;}
  .we-page img{max-width:100%;height:auto;cursor:pointer;}
  .we-page img.free{position:absolute;max-width:none;z-index:1;}
  .we-page table{border-collapse:collapse;width:100%;font-family:'Sofia Sans Condensed',sans-serif;font-size:10pt;margin:6px 0;}
  .we-page table td,.we-page table th{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top;}
  .we-page table th{background:var(--green-soft);color:var(--green-dark);}
  .we-docbody:empty:before{content:"${"Start typing, or insert an item from the panel →"}";color:var(--muted);}

  /* page-break guides + image selection handles overlay */
  .we-guides{position:absolute;left:0;right:0;top:0;bottom:0;pointer-events:none;z-index:5;}
  .we-brk{position:absolute;left:0;right:0;display:flex;justify-content:center;}
  .we-brk span{font-size:9px;color:var(--muted);background:var(--canvas);padding:1px 9px;border-radius:6px;}
  .we-ov{position:absolute;inset:0;pointer-events:none;z-index:6;}
  .we-h{position:absolute;width:11px;height:11px;background:#fff;border:1.6px solid var(--green-dark);border-radius:2px;pointer-events:auto;}
  .we-h.nw{cursor:nwse-resize;} .we-h.ne{cursor:nesw-resize;} .we-h.sw{cursor:nesw-resize;} .we-h.se{cursor:nwse-resize;}
  .we-h.n,.we-h.s{cursor:ns-resize;} .we-h.e,.we-h.w{cursor:ew-resize;}
  .we-h.mv{cursor:move;border-radius:50%;background:var(--green-dark);}
  .we-selbox{position:absolute;border:1.5px solid var(--green-dark);pointer-events:none;}

  .we-imgbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px;box-shadow:0 4px 16px rgba(15,30,22,.10);align-self:stretch;}
  .we-imgbar .grp{display:inline-flex;align-items:center;gap:6px;}
  .we-num{width:52px;border:1px solid var(--line);border-radius:7px;padding:5px 6px;font-size:13px;text-align:center;}
  .we-pill{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 11px;border:1px solid var(--line);background:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:var(--ink);}
  .we-pill:hover{background:var(--green-soft);}
  .we-pill.active{background:var(--green-soft);border-color:var(--green-line);color:var(--green-dark);}
  .we-pill.danger{color:var(--red);border-color:var(--red-soft);background:#fdf5f4;}
  .we-unit{display:inline-flex;border:1px solid var(--line);border-radius:7px;overflow:hidden;}
  .we-unit button{border:0;background:#fff;padding:5px 8px;font-size:12px;font-weight:700;cursor:pointer;color:var(--muted);}
  .we-unit button.active{background:var(--green-soft);color:var(--green-dark);}

  .we-panel{width:330px;flex-shrink:0;background:var(--white);border:1px solid var(--line);border-radius:14px;box-shadow:0 4px 14px rgba(15,30,22,.06);padding:16px;max-height:82vh;overflow:auto;}
  .we-panelhdr{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
  .we-panelhdr .ttl{font-weight:700;font-size:16px;color:var(--ink);}
  .we-collapse{margin-left:auto;border:0;background:none;cursor:pointer;color:var(--muted);font-size:14px;line-height:1;padding:4px;}
  .we-seclabel{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);}
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
  .we-page .sig .col{flex:1;border-top:1px solid #999;padding-top:3px;font-size:.82em;color:var(--muted);text-align:center;}
  .we-page .formula{background:var(--green-soft);border-left:3px solid var(--green-dark);padding:7px 12px;font-family:'Sofia Sans Condensed',sans-serif;margin:7px 0;}
  .we-page .internal{border:1px dashed var(--green-dark);background:var(--green-soft);border-radius:6px;padding:9px 12px;margin:8px 0 4px;color:var(--green-dark);font-family:'Sofia Sans Condensed',sans-serif;font-size:.9em;}
  .we-page ul.tight{margin:4px 0;padding-left:20px;} .we-page ul.tight li{margin:3px 0;}
  .we-page .ohead{display:flex;align-items:center;gap:14px;border-bottom:2px solid var(--red);padding-bottom:8px;} .we-page .ohead .logo{height:54px;} .we-page .ohead .who{font-family:'Sofia Sans Condensed',sans-serif;font-size:.86em;color:var(--muted);margin-left:auto;text-align:right;}
  .we-page .otitle{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:var(--green-dark);font-size:1.7em;text-align:center;letter-spacing:3px;margin:22px 0 0;}
  .we-page .odate{text-align:center;color:var(--muted);font-family:'Sofia Sans Condensed',sans-serif;margin:2px 0 14px;}
  .we-page .odecl{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:var(--red);text-align:center;font-size:1.1em;letter-spacing:2px;margin:12px 0 10px;}
  .we-page .frame{border:2px solid var(--green-line);border-radius:10px;padding:28px;display:flex;flex-direction:column;align-items:center;text-align:center;}
  .we-page .ctitle{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:var(--green-dark);font-size:2.4em;letter-spacing:2px;margin:18px 0 2px;}
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
  hasDefault,
  schemeType = "T",
  snippets,
  fields,
  customItems = [],
  savedTemplates = [],
  copyFrom = [],
}: {
  schemeId: string;
  docKey: string;
  docNameEn: string;
  initialBg: string;
  initialEn: string;
  defaultBg: string;
  defaultEn: string;
  hasDefault: boolean;
  schemeType?: "T" | "C";
  snippets: Snippet[];
  fields: Field[];
  customItems?: Snippet[];
  savedTemplates?: Tmpl[];
  copyFrom?: CopyItem[];
}) {
  const { lang: uiLang } = useLang();
  const L = (bg: string, en: string) => (uiLang === "bg" ? bg : en);
  const pageRef = useRef<HTMLDivElement>(null);   // the paper (positioning context for handles)
  const ref = useRef<HTMLDivElement>(null);       // the editable body (.we-docbody)
  const fileRef = useRef<HTMLInputElement>(null);
  const [lang, setLang] = useState<"bg" | "en">("bg");
  const [bg, setBg] = useState(initialBg);
  const [en, setEn] = useState(initialEn);
  const [started, setStarted] = useState(initialBg !== "" || initialEn !== "");
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState("");
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
  const [guides, setGuides] = useState<number[]>([]); // page-break y offsets (px rel. to paper)
  const [cell, setCell] = useState<HTMLTableCellElement | null>(null); // selected table cell
  const lockRef = useRef(lockAspect);
  lockRef.current = lockAspect;
  const drag = useRef<null | { mode: "resize" | "move"; handle: string; px: number; py: number; w: number; h: number; left: number; top: number; ratio: number }>(null);

  useEffect(() => {
    if (started && ref.current) ref.current.innerHTML = lang === "bg" ? bg : en;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const exec = (cmd: string, val?: string) => { ref.current?.focus(); document.execCommand(cmd, false, val); setSaved(false); };
  const insertHtml = (html: string) => { ref.current?.focus(); document.execCommand("insertHTML", false, html); setSaved(false); refreshGuides(); };
  const current = () => ref.current?.innerHTML ?? "";

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
  // recompute page-break guides from the paper's current height
  function refreshGuides() {
    const page = pageRef.current;
    if (!page) return;
    const pageHpx = mmToPx(PAGE_BREAK_MM);
    const period = pageHpx + 16;            // one page + the grey gap below it
    const h = page.scrollHeight;
    const out: number[] = [];               // y of the top of each gap
    for (let n = 1; (n - 1) * period + pageHpx < h; n++) out.push((n - 1) * period + pageHpx);
    setGuides(out);
  }
  useEffect(() => { place(); /* eslint-disable-next-line */ }, [imgSel, imgW, imgH, wrap]);
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
  function deselect() { setImgSel(null); setBox(null); }

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
    if (!tgt.classList.contains("we-h")) deselect();
    setCell(cellOf(tgt));
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
    const cur = current();
    const nb = lang === "bg" ? cur : bg;
    const ne = lang === "en" ? cur : en;
    setBg(nb); setEn(ne);
    return { nb, ne };
  }
  function switchLang(l: "bg" | "en") {
    if (l === lang) return;
    const { nb, ne } = fold();
    setLang(l);
    if (ref.current) ref.current.innerHTML = l === "bg" ? nb : ne;
    setTimeout(refreshGuides, 0);
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
    setEn(r.html ?? ""); setSaved(false);
    if (lang === "en" && ref.current) ref.current.innerHTML = r.html ?? "";
    else alert(L("Английската чернова е готова — превключете към EN, за да я прегледате/редактирате.", "English draft ready — switch to EN to review/edit it."));
  }
  async function downloadPdf() {
    await save();
    setBusy("pdf");
    try {
      const res = await fetch("/api/pdf", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: schemeId, doc: docKey, lang, composed: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `${schemeId}_${docKey}_${lang}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(L("Грешка при PDF: ", "PDF failed: ") + (e as Error).message);
    }
    setBusy("");
  }
  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const src = String(rd.result);
      const probe = new Image();
      probe.onload = () => {
        const wmm = 60; // sensible default width
        const hmm = roundMm(wmm * (probe.naturalHeight / Math.max(1, probe.naturalWidth)));
        insertHtml(`<img src="${src}" alt="" style="width:${wmm}mm;height:${hmm}mm">`);
      };
      probe.onerror = () => insertHtml(`<img src="${src}" alt="" style="width:60mm">`);
      probe.src = src;
    };
    rd.readAsDataURL(f);
    e.target.value = "";
  }
  function startWith(b: string, e: string) {
    setBg(b); setEn(e); setLang("bg"); setStarted(true); setSaved(false);
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
        <style>{EDITOR_CSS}</style>
        <link rel="stylesheet" href={FONTS_HREF} />
        <div className="card p-5" style={{ borderLeft: "4px solid var(--green-dark)", maxWidth: 640 }}>
          <div className="font-bold" style={{ color: "var(--green-dark)", fontSize: 18 }}>{L(`Започни „${docNameEn}“ от…`, `Start “${docNameEn}” from…`)}</div>
          <div className="flex gap-2 mt-4 flex-wrap">
            {hasDefault && <button className="btn btn-primary" onClick={() => startWith(defaultBg, defaultEn)}>{L("Шаблон по подразбиране", "Default template")}</button>}
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
      <style>{EDITOR_CSS}</style>
      <link rel="stylesheet" href={FONTS_HREF} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onImage} />

      {/* action bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button className="btn btn-primary" onClick={save} disabled={busy === "save"}>{busy === "save" ? L("Запазване…", "Saving…") : saved ? L("Запазено ✓", "Saved ✓") : L("Запази", "Save")}</button>
        <span className="text-sm" style={{ color: "var(--muted)", marginLeft: 6 }}>{L("Преглед:", "Preview:")}</span>
        {(["bg", "en"] as const).map((l) => (
          <button key={l} className="btn" onClick={() => switchLang(l)} style={lang === l ? { background: "var(--green-soft)", color: "var(--green-dark)", borderColor: "var(--green-line)" } : {}}>{l === "bg" ? "БГ" : "EN"}</button>
        ))}
        <button className="btn" onClick={translate} disabled={busy === "tr"} title={L("Преведи целия документ BG→EN", "Translate the whole document BG→EN")}>{busy === "tr" ? L("Превеждане…", "Translating…") : "⇄ BG → EN"}</button>
        <button className="btn" onClick={downloadPdf} disabled={busy === "pdf"}>{busy === "pdf" ? "…" : "⬇ PDF"}</button>
        <button className="btn" onClick={saveAsTemplate} disabled={busy === "tmpl"} title={L("Запази този документ като шаблон за повторна употреба за този тип схема", "Save this document as a reusable template for this scheme type")}>{busy === "tmpl" ? "…" : L("★ Запази като шаблон", "★ Save as template")}</button>
        <button className="btn ml-auto" onClick={() => setPanel((p) => !p)}>{panel ? L("Елементи ▸", "Items ▸") : L("Елементи ◂", "Items ◂")}</button>
      </div>

      {/* formatting toolbar */}
      <div className="we-toolbar mb-3">
        {tool("B", L("Получер", "Bold"), () => exec("bold"))}
        {tool(<span style={{ fontStyle: "italic" }}>I</span>, L("Курсив", "Italic"), () => exec("italic"))}
        {tool(<span style={{ textDecoration: "underline" }}>U</span>, L("Подчертан", "Underline"), () => exec("underline"))}
        <span className="we-sep" />
        {tool("H2", L("Заглавие", "Heading"), () => exec("formatBlock", "h2"))}
        {tool("¶", L("Нормален текст", "Normal text"), () => exec("formatBlock", "p"))}
        <span className="we-sep" />
        {tool(L("•  Списък", "•  List"), L("Списък с водещи символи", "Bullet list"), () => exec("insertUnorderedList"))}
        {tool(L("1.  Списък", "1.  List"), L("Номериран списък", "Numbered list"), () => exec("insertOrderedList"))}
        {tool("⇤", L("Намали отстъпа", "Decrease indent"), () => exec("outdent"))}
        {tool("⇥", L("Увеличи отстъпа", "Increase indent"), () => exec("indent"))}
        <span className="we-sep" />
        {tool(L("Изображение", "Image"), L("Вмъкни изображение / лого", "Insert image / logo"), () => fileRef.current?.click())}
        {tool(L("▦ Таблица", "▦ Table"), L("Вмъкни таблица", "Insert table"), insertTable)}
        <span className="we-sep" />
        {tool("↶", L("Отмени", "Undo"), () => exec("undo"))}
        {tool("↷", L("Върни", "Redo"), () => exec("redo"))}
        <span className="text-xs" style={{ marginLeft: "auto", color: "var(--muted)" }}>{L("Редактиране:", "Editing:")} <b style={{ color: "var(--green-dark)" }}>{lang === "bg" ? L("Български", "Bulgarian") : L("Английски", "English")}</b></span>
      </div>

      <div className="we-body">
        <div className="we-col">
          {/* image controls — Word-like: exact mm size, wrap, layering */}
          {imgSel && (
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
              <button className="we-pill danger" onMouseDown={(e) => e.preventDefault()} onClick={removeImg}>✕ {L("Премахни", "Remove")}</button>
            </div>
          )}

          {cell && !imgSel && (
            <div className="we-imgbar">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>▦ {L("Таблица", "Table")}</span>
              <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={() => addRow(false)}>↥ {L("Ред отгоре", "Row above")}</button>
              <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={() => addRow(true)}>↧ {L("Ред отдолу", "Row below")}</button>
              <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={() => addCol(false)}>↤ {L("Колона отляво", "Column left")}</button>
              <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={() => addCol(true)}>↦ {L("Колона отдясно", "Column right")}</button>
              <span className="we-sep" />
              <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={delRow}>{L("Изтрий реда", "Delete row")}</button>
              <button className="we-pill" onMouseDown={(e) => e.preventDefault()} onClick={delCol}>{L("Изтрий колоната", "Delete column")}</button>
              <button className="we-pill danger" onMouseDown={(e) => e.preventDefault()} onClick={delTable}>✕ {L("Изтрий таблицата", "Delete table")}</button>
            </div>
          )}

          <div ref={pageRef} className="we-page" onMouseDown={onEditorMouseDown}>
            <div
              ref={ref}
              className="we-docbody"
              contentEditable
              suppressContentEditableWarning
              onInput={() => { setSaved(false); refreshGuides(); }}
              onKeyUp={syncCell}
            />
            {/* page-break guides */}
            <div className="we-guides">
              {guides.map((y, i) => (
                <div key={i} className="we-brk" style={{ top: y }}><span>{L(`стр. ${i + 1} / ${i + 2}`, `page ${i + 1} / ${i + 2}`)}</span></div>
              ))}
            </div>
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

            <div className="we-seclabel" style={{ margin: "14px 0 4px" }}>{L("ФРАГМЕНТИ", "SNIPPETS")}</div>
            {snippets.map((s) => itemCard(`s:${s.id}`, s.name, lang === "bg" ? s.bg : s.en))}

            {custom.length > 0 && <div className="we-seclabel" style={{ margin: "14px 0 4px", color: "var(--gold)" }}>{L("МОИ ЕЛЕМЕНТИ", "MY ITEMS")}</div>}
            {custom.map((c) => itemCard(`c:${c.id}`, c.name, lang === "bg" ? c.bg : c.en))}

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
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        {L("Страницата е с размер A4 — каквото виждате, това се отпечатва. Кликнете изображение, за да промените размера (точен размер в мм), да го преместите или да го наслоите.",
           "The page is A4 size — what you see is what prints. Click an image to resize it (exact mm size), move it, or layer it.")}
      </p>
    </div>
  );
}
