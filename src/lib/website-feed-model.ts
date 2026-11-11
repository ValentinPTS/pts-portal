// The website's feed (plan part 10.2; the answer map: «the portal is the data source and the website gets
// a subset by a button»; Реш. 147; 1.8). Pure.
//
// The format is the portal's PROPOSAL (schema_version 1) — not yet agreed with Creativiso. Started and
// finished schemes only; per scheme its public facts and its state in words (10.1) and the links to its
// public page and its released plan and invitation (D15). Never a count, free places, the maximum, a price
// (not outside the portal), a participant or a draft.
//
// Published only by a person's press («Публикувай за сайта»), as built then — the address serves the LAST
// PUBLISHED version, never the live data; when served, a scheme no longer started drops out at once.

import type { Scheme } from "./types";
import { catalogueState, STATE_TEXT, type CatalogueState } from "./catalogue-model";
import { schemeMarkers } from "./scheme-number";

export const FEED_SCHEMA_VERSION = 1;

export interface FeedScheme {
  id: string;
  number: string;
  title: { bg: string; en: string };
  object: { bg: string; en: string };
  activity: "T" | "S" | "C" | null;
  kind: "PTS" | "ILC" | null;
  /** within the accredited scope; false: «NA»; null: not stated */
  accredited: boolean | null;
  state: { key: CatalogueState; bg: string; en: string };
  /** the applications' deadline, while the scheme takes them — as PTS set it (a day, or a day and an hour) */
  applicationsDue: string | null;
  links: { page: string; plan: string | null; invitation: string | null };
}
export interface Feed { schema_version: number; schemes: FeedScheme[] }
export interface PublishedFeed extends Feed { version: number; published_at: string }

const ORDER: Record<CatalogueState, number> = { accepting: 0, full: 0, deadline: 1, closed: 1, running: 1, processing: 1, report: 2, finished: 2, not_held: 2 };

/** The feed from the started schemes, as it would be published now. `base`: the portal's own address. */
export function buildFeed(schemes: readonly Scheme[], nowMs: (s: Scheme) => number, full: (s: Scheme) => boolean, base: string): Feed {
  const root = base.replace(/\/+$/, "");
  const out: FeedScheme[] = [];
  for (const s of schemes) {
    const st = catalogueState(s, nowMs(s), s.status === "open" && full(s));
    if (!st) continue; // a draft — never (Реш. 147)
    const m = schemeMarkers(s);
    const doc = (k: "plan" | "invitation") => (s.sentToParticipants?.[k] && s.releasedEditions?.[k] ? `${root}/apply/${encodeURIComponent(s.id)}/${k}` : null);
    out.push({
      id: s.id,
      number: s.number,
      title: { bg: s.titleBg ?? "", en: s.titleEn ?? "" },
      object: { bg: s.objectBg ?? "", en: s.objectEn ?? "" },
      activity: m.activity ?? null,
      kind: m.kind ?? null,
      accredited: m.accredited ?? null,
      state: { key: st, ...STATE_TEXT[st] },
      applicationsDue: (st === "accepting" || st === "full") && s.dates?.applicationsDue ? s.dates.applicationsDue : null,
      links: { page: `${root}/apply/${encodeURIComponent(s.id)}`, plan: doc("plan"), invitation: doc("invitation") },
    });
  }
  out.sort((a, b) => ORDER[a.state.key] - ORDER[b.state.key] || b.number.localeCompare(a.number, "en", { numeric: true }));
  return { schema_version: FEED_SCHEMA_VERSION, schemes: out };
}

/** As served: the published version, less any scheme no longer started (taken back to draft, archived). */
export function servedFeed(p: PublishedFeed, startedIds: ReadonlySet<string>): PublishedFeed {
  return { ...p, schemes: p.schemes.filter((x) => startedIds.has(x.id)) };
}
