import type { Lang } from "./types";

// Pure, dependency-free document primitives shared by the server render path
// (doc-shell.ts) AND the client-side skin editor preview. Kept in its own module
// so the editor can import the exact stylesheet + helpers WITHOUT pulling in the
// server-only skin engine (doc-shell.ts imports node:async_hooks, which cannot be
// bundled for the browser).

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const pick = (lang: Lang, en: string, bg: string) => (lang === "bg" ? bg : en);

// Invisible markers that delimit the editable BODY of every document — the region
// between the cover/head and the footer. The builder extracts what's between them
// as the editable content, and re-injects the edited body back here for the PDF,
// so each document keeps its own cover, head, footer and CSS automatically.
export const BODY_START = "<!--PTS:BS-->";
export const BODY_END = "<!--PTS:BE-->";
export const stripBodyMarkers = (html: string) =>
  html.split(BODY_START).join("").split(BODY_END).join("");

// Marker placed at the very start of an editable region that INCLUDES the title
// page (cover). Its presence tells the export pipeline the saved content already
// carries its own cover, so the skin's cover must NOT be re-added on top. Legacy
// documents (saved before editable covers) have no marker → cover is regenerated.
export const COVER_MARK = "<!--PTS:CV-->";
export const stripCoverMark = (html: string) => html.split(COVER_MARK).join("");

// Web-font stylesheet for the built-in skins (PT Serif body + Sofia Sans headings).
export const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&family=Sofia+Sans+Condensed:wght@400;600;700;800&display=swap";

// The shared document stylesheet — the strict PTS brand. Skins layer their own
// overrides on top of this (same semantic markup: h2.sec, .ptable, .team, …), so
// the document BODY is skin-independent and swapping the skin re-themes all 14 docs.
export const DOC_CSS = `
  :root{--green:#88a77b;--green-dark:#5f7d52;--green-soft:#eef3ea;--red:#9e2b2b;--ink:#1a1a1a;--muted:#6b6b6b;--line:#dcdcdc;
    --sans:'Sofia Sans Condensed','Segoe UI',Arial,sans-serif;--serif:'PT Serif',Georgia,serif;}
  @page{size:A4;margin:16mm 14mm 18mm;}
  *{box-sizing:border-box;}
  body{margin:0;color:var(--ink);font-family:var(--serif);font-size:11pt;line-height:1.5;background:#fff;}
  .page{max-width:800px;margin:0 auto;padding:26px 30px 50px 50px;}
  /* traditional embroidery border down the LEFT of every page (position:fixed
     repeats it on each printed page in Chromium); sits in the left padding so it
     never overlaps text. */
  .doc-side{position:fixed;top:0;bottom:0;left:0;width:8mm;background:url(/brand/embroidery-side.png) top center/100% auto repeat-y;pointer-events:none;z-index:40;}
  .head{display:flex;align-items:center;gap:16px;} .head .logo{height:64px;} .head .tag{height:24px;margin-left:auto;}
  .emb{display:block;width:100%;height:auto;margin:10px 0 6px;}
  .emb.bottom{margin:18px 0 2px;}
  .cover{text-align:center;break-after:page;page-break-after:always;padding-bottom:18px;}
  .docttl{font-family:var(--sans);font-weight:800;color:var(--green-dark);font-size:22pt;margin:14px 0 2px;}
  .inacc{color:var(--muted);font-size:10.5pt;}
  .schemeno{font-family:var(--sans);font-weight:700;color:var(--red);font-size:14pt;margin-top:10px;}
  .schemettl{font-family:var(--sans);font-weight:700;font-size:13pt;margin:2px 0 10px;}
  .coverimg{width:46%;max-width:100%;height:auto;border-radius:8px;margin-top:10px;}
  img{max-width:100%;}
  /* lighter document header (logo + embroidery band + centred title) for utility
     forms that don't have a full title page; the wrap is a white band that bleeds
     left over the side embroidery so the side strip starts at the first section */
  .dochead-wrap{position:relative;z-index:41;background:#fff;margin:-26px 0 0 -50px;padding:26px 0 4px 50px;}
  .dochead{display:flex;align-items:center;gap:18px;margin:0 0 4px;}
  .dochead .logo{height:54px;flex:0 0 auto;}
  .dochead .hband{flex:1;height:38px;background:url(/brand/embroidery-border.png) left center/auto 100% repeat-x;}
  .docttl2{font-family:var(--sans);font-weight:800;color:var(--green-dark);font-size:20pt;text-align:center;letter-spacing:1.5px;margin:14px 0 8px;}
  /* contact strip on every title page (globe · mail · phone) */
  .contacts{display:flex;gap:14px;justify-content:center;margin-top:26px;flex-wrap:wrap;}
  .contact{display:flex;align-items:center;gap:10px;border:1px solid var(--green);border-radius:10px;padding:9px 16px;background:#fff;}
  .contact .ico{display:inline-flex;flex:0 0 auto;} .contact .ico svg{width:30px;height:30px;display:block;}
  .contact .ctext{color:var(--red);font-family:var(--sans);font-weight:700;font-size:11pt;letter-spacing:.2px;}
  h2.sec{font-family:var(--sans);font-weight:700;font-size:13.5pt;color:var(--ink);margin:20px 0 4px;padding-bottom:5px;border-bottom:2.5px solid var(--red);}
  h2.sec .n{color:var(--green-dark);} h2.sec, .body{page-break-inside:avoid;}
  h3.sub{font-family:var(--sans);font-weight:700;font-size:11.5pt;color:var(--green-dark);margin:12px 0 3px;}
  .body{margin-bottom:6px;} .muted{color:var(--muted);font-size:10pt;}
  p{margin:6px 0;}
  .note{font-size:9pt;color:var(--muted);margin:4px 0 2px;}
  .imp{font-family:var(--sans);font-weight:700;color:var(--red);margin:8px 0 4px;}
  .example{font-size:9pt;font-style:italic;color:var(--muted);margin:3px 0;}
  .team{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
  .role{background:var(--green-soft);border-radius:6px;padding:5px 9px;}
  .role .rl{display:block;font-family:var(--sans);font-weight:700;font-size:9.5pt;color:var(--green-dark);}
  .role .nm{font-size:10.5pt;}
  .partner{display:flex;gap:12px;align-items:flex-start;} .partner img{height:46px;}
  .partner ul{margin:4px 0 0;padding-left:18px;font-size:10pt;}
  table.ptable{border-collapse:collapse;width:100%;font-family:var(--sans);font-size:10pt;margin:6px 0;}
  table.ptable th,table.ptable td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top;}
  table.ptable th{background:var(--green-soft);color:var(--green-dark);}
  .cals{display:flex;gap:8px;flex-wrap:wrap;}
  .cal{width:96px;border:1px solid var(--green);border-radius:8px;overflow:hidden;text-align:center;}
  .cal .bar{display:block;height:10px;background:var(--green);}
  .cal .d{font-family:var(--sans);font-weight:700;color:var(--red);font-size:13pt;padding:4px 0 0;}
  .cal .lbl{font-size:8pt;color:var(--muted);padding:2px 4px 6px;line-height:1.15;}
  /* form documents */
  .fld{margin:7px 0;} .fld .fl{font-family:var(--sans);font-weight:700;font-size:10pt;color:var(--ink);}
  .blank{display:inline-block;min-width:220px;border-bottom:1px solid var(--line);height:15px;vertical-align:bottom;}
  .selbox{display:inline-block;border:1px solid var(--green-dark);border-radius:5px;padding:1px 10px;font-family:var(--sans);font-weight:700;color:var(--green-dark);font-size:10pt;}
  .sig{display:flex;justify-content:space-between;gap:24px;margin-top:22px;}
  .sig .col{flex:1;border-top:2px solid var(--green-dark);padding-top:4px;font-size:9pt;color:var(--ink);text-align:center;}
  /* nested numbered lists: 1. / 1.1. / 1.2. — use the toolbar's indent inside a list */
  ol{counter-reset:item;}
  ol>li{counter-increment:item;}
  ol>li::marker{content:counters(item,".") ". ";}
  .docfooter{margin-top:22px;border-top:1px solid var(--line);padding-top:6px;font-family:var(--sans);font-size:8.5pt;color:var(--muted);text-align:center;}
  /* editor-inserted formulas (native MathML — renders in Chromium incl. the PDF pass) */
  .we-f{display:inline-block;padding:0 1px;}
  math{font-size:1.06em;}
  /* fillable form fields (see lib/form-fields.ts) */
  .ff-opt{display:inline-flex;align-items:center;gap:7px;font-family:var(--sans);font-size:10pt;margin:4px 14px 4px 0;}
  .ff-box{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1.6px solid var(--green-dark);border-radius:3px;color:var(--green-dark);font-size:11px;line-height:1;font-weight:700;flex:0 0 auto;}
  .ff-rb{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1.6px solid var(--green-dark);border-radius:50%;color:var(--green-dark);font-size:9px;line-height:1;flex:0 0 auto;}
  .ff-box.on,.ff-rb.on{background:var(--green-soft);}
  .ff-cb,.ff-rb-in{width:14px;height:14px;accent-color:var(--green-dark);margin:0;}
  .ff-line{display:inline-block;border-bottom:1px solid var(--ink);min-width:220px;padding:0 3px 1px;font-family:var(--sans);font-size:10pt;line-height:1.4;}
  .ff-line[data-empty="1"]{border-bottom-color:var(--line);min-height:14px;}
  input.ff-line{border:none;border-bottom:1px solid var(--ink);outline:none;background:transparent;}
  input.ff-line:focus{border-bottom-color:var(--green-dark);background:var(--green-soft);}
  .ff-lines .ff-lrow{border-bottom:1px solid var(--line);min-height:20px;font-family:var(--sans);font-size:10pt;padding:1px 2px;}
  .ff-area{display:block;width:100%;border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-family:var(--sans);font-size:10pt;line-height:1.5;resize:vertical;}
  .ff-area:focus{outline:none;border-color:var(--green-dark);}
  .ff-scale{display:inline-flex;align-items:center;gap:16px;}
  .ff-pt{display:inline-flex;flex-direction:column;align-items:center;gap:3px;font-family:var(--sans);}
  .ff-pn{font-weight:700;font-size:10pt;}
  .ff-rate{display:inline-block;width:15px;height:15px;border:1.5px solid var(--green-dark);border-radius:50%;}
  .ff-rate.on{background:var(--green-dark);}
  .ff-rate-in{width:16px;height:16px;accent-color:var(--green-dark);margin:0;}
  .ff-end{color:var(--muted);font-size:9.5pt;font-family:var(--sans);}
  .ff-selbox{display:inline-block;border:1px solid var(--green-dark);border-radius:5px;padding:1px 10px;min-width:60px;font-family:var(--sans);font-weight:700;color:var(--green-dark);font-size:10pt;text-align:center;}
  .ff-select{border:1px solid var(--green-dark);border-radius:5px;padding:2px 8px;font-family:var(--sans);font-size:10pt;color:var(--green-dark);background:#fff;}
`;
