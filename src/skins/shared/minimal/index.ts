import type { Scheme, Lang } from "../../../lib/types";
import type { Skin } from "../../types";
import { DOC_CSS, esc, pick } from "../../../lib/doc-shell";

// "Minimal" — black-on-white, one hairline rule, no embroidery, maximum content
// space. Works for testing and calibration. Shared document CSS + theme overrides.
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&family=Sofia+Sans+Condensed:wght@400;600;700;800&display=swap";

const OVERRIDES = `
  :root{--green:#2b2b2b;--green-dark:#111111;--green-soft:#f5f5f5;--red:#999999;--line:#e6e6e6;--muted:#777777;}
  .mincover{text-align:left;break-after:page;page-break-after:always;padding:6px 0 18px;}
  .mincover .minlogo{height:40px;}
  .mincover .mintitle{font-family:var(--sans);font-weight:800;color:#111;font-size:24pt;letter-spacing:.4px;margin:26px 0 0;}
  .mincover .minrule{height:2px;width:60px;background:#111;margin:10px 0 14px;}
  .mincover .minno{font-family:var(--sans);font-weight:700;font-size:12.5pt;}
  .mincover .minacc{color:var(--muted);font-size:10.5pt;margin-top:4px;}
  h2.sec{border-bottom:1px solid var(--line);color:#111;font-weight:700;padding-bottom:4px;}
  h2.sec .n{color:#111;}
  table.ptable th{background:transparent;color:#111;border-bottom:2px solid #111;}
  .docfooter{text-align:left;color:var(--muted);}
`;

function cover(s: Scheme, lang: Lang, docTitleEn: string, docTitleBg: string, opts: { withImage?: boolean } = {}): string {
  const inAcc = pick(lang, "in accordance with", "съгласно");
  return `<div class="cover mincover">
    <img class="minlogo" src="/brand/logo.png" alt="PTS Bulgaria">
    <div class="mintitle">${esc(pick(lang, docTitleEn, docTitleBg))}</div>
    <div class="minrule"></div>
    <div class="minno">${esc(s.number)} · ${esc(pick(lang, s.titleEn, s.titleBg))}</div>
    <div class="minacc">${esc(inAcc)} ${esc(s.standard)}</div>
    ${opts.withImage && s.coverImage ? `<img class="coverimg" src="${s.coverImage}" alt="" style="max-width:46%;margin-top:12px;border-radius:6px">` : ""}
  </div>`;
}
function footer(s: Scheme, formNumber: string): string {
  return `<div class="docfooter">${esc(s.revision)} · ${esc(formNumber)} · ${esc(s.revisionDate)}</div>`;
}

export const minimalSkin: Skin = {
  meta: { id: "minimal", name: "Minimal", description: "Black-on-white, a single hairline rule, maximum content space.", types: ["T", "C"] },
  css: DOC_CSS + OVERRIDES,
  fontsHref: FONTS_HREF,
  cover,
  footer,
};
