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
  .page{max-width:800px;margin:0 auto;padding:26px 30px 50px;}
  .head{display:flex;align-items:center;gap:16px;} .head .logo{height:64px;} .head .tag{height:24px;margin-left:auto;}
  .emb{display:block;width:100%;height:auto;margin:10px 0 6px;}
  .cover{text-align:center;break-after:page;page-break-after:always;padding-bottom:18px;}
  .docttl{font-family:var(--sans);font-weight:800;color:var(--green-dark);font-size:22pt;margin:14px 0 2px;}
  .inacc{color:var(--muted);font-size:10.5pt;}
  .schemeno{font-family:var(--sans);font-weight:700;color:var(--red);font-size:14pt;margin-top:10px;}
  .schemettl{font-family:var(--sans);font-weight:700;font-size:13pt;margin:2px 0 10px;}
  .coverimg{max-width:46%;height:auto;border-radius:8px;margin-top:6px;}
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
  .sig .col{flex:1;border-top:1px solid #999;padding-top:3px;font-size:9pt;color:var(--muted);text-align:center;}
  .docfooter{margin-top:22px;border-top:1px solid var(--line);padding-top:6px;font-family:var(--sans);font-size:8.5pt;color:var(--muted);text-align:center;}
`;
