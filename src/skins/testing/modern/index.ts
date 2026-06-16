import type { Scheme, Lang } from "../../../lib/types";
import type { Skin } from "../../types";
import { DOC_CSS, esc, pick } from "../../../lib/doc-shell";

// "Modern" — a cleaner, sans-led look: a green header band on the cover, a left
// accent rule on section headings instead of the red underline, airier spacing.
// Built on the shared document CSS + theme overrides (same semantic markup).
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&family=Sofia+Sans+Condensed:wght@400;600;700;800&display=swap";

const OVERRIDES = `
  :root{--green:#357a4f;--green-dark:#2b6744;--green-soft:#eef4f0;--red:#2b6744;--line:#e2e6e4;}
  .mcover{break-after:page;page-break-after:always;padding-bottom:18px;}
  .mcover .mband{display:flex;align-items:center;gap:16px;background:var(--green-dark);border-radius:12px;padding:18px 22px;}
  .mcover .mband .mlogo{height:52px;filter:brightness(0) invert(1);}
  .mcover .mband .mttl{font-family:var(--sans);font-weight:800;color:#fff;font-size:21pt;letter-spacing:.4px;}
  .mcover .minfo{margin-top:20px;}
  .mcover .minfo .mno{font-family:var(--sans);font-weight:800;color:var(--green-dark);font-size:16pt;}
  .mcover .minfo .mname{font-family:var(--sans);font-weight:700;font-size:13pt;margin-top:2px;}
  .mcover .minfo .macc{color:var(--muted);font-size:10.5pt;margin-top:6px;}
  .mcover .coverimg{max-width:52%;height:auto;border-radius:10px;margin-top:14px;}
  h2.sec{border-bottom:none;border-left:4px solid var(--green);padding:2px 0 2px 12px;margin:22px 0 6px;color:var(--green-dark);}
  h2.sec .n{color:var(--green);}
  table.ptable th{background:var(--green-soft);color:var(--green-dark);}
  .docfooter{text-align:left;color:var(--green-dark);border-top:2px solid var(--green-soft);}
`;

function cover(s: Scheme, lang: Lang, docTitleEn: string, docTitleBg: string, opts: { withImage?: boolean } = {}): string {
  const inAcc = pick(lang, "in accordance with", "съгласно");
  return `<div class="mcover">
    <div class="mband"><img class="mlogo" src="/brand/logo.png" alt="PTS Bulgaria"><div class="mttl">${esc(pick(lang, docTitleEn, docTitleBg))}</div></div>
    <div class="minfo">
      <div class="mno">${esc(s.number)}</div>
      <div class="mname">${esc(pick(lang, s.titleEn, s.titleBg))}</div>
      <div class="macc">${esc(inAcc)} ${esc(s.standard)}</div>
    </div>
    ${opts.withImage && s.coverImage ? `<img class="coverimg" src="${s.coverImage}" alt="">` : ""}
  </div>`;
}
function footer(s: Scheme, formNumber: string): string {
  return `<div class="docfooter">${esc(s.revision)} · ${esc(formNumber)} · ${esc(s.revisionDate)}</div>`;
}

export const modernSkin: Skin = {
  meta: { id: "modern", name: "Modern", description: "Cleaner sans layout with a side accent and airy spacing.", types: ["T"] },
  css: DOC_CSS + OVERRIDES,
  fontsHref: FONTS_HREF,
  cover,
  footer,
};
