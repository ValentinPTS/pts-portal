import type { Scheme, Lang } from "../lib/types";

// A "skin" is the visual look of the generated documents — the cover/head layout,
// fonts, colours, section/table styling and footer. The document BODY is skin-
// independent (semantic markup: h2.sec, .ptable, .team, …), so swapping the skin
// re-themes all 14 documents at once. Skins live as self-contained folders under
// src/skins/{testing,calibration,shared}/<id>/ and are listed in src/skins/index.ts.
export type SchemeType = "T" | "C";

export interface SkinMeta {
  id: string;
  name: string;
  description: string;
  types: SchemeType[]; // which scheme types this skin is offered for
}

export interface Skin {
  meta: SkinMeta;
  css: string; // full document stylesheet (the classic DOC_CSS + this skin's overrides)
  fontsHref: string; // the <link> stylesheet href for the skin's web fonts
  // Show the traditional embroidery border down the side of every page. Defaults to
  // true (the PTS brand); custom skins follow their "embroidery" cover toggle so the
  // alternative looks (modern/bold/minimal…) stay clean.
  sideBorder?: boolean;
  // The cover/head block (no body markers — the shell adds those).
  cover(s: Scheme, lang: Lang, docTitleEn: string, docTitleBg: string, opts?: { withImage?: boolean }): string;
  // The footer block (no body markers).
  footer(s: Scheme, formNumber: string): string;
}
