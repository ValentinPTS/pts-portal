// Plan part 10.2 — the website's feed: started and finished schemes only (Реш. 147), their public facts and
// states (10.1), links to the released plan and invitation (D15) — never a count, the maximum, a price or a
// participant; published only by a person's press, the version that person saw; served as published, less
// any scheme no longer started.
import { readFileSync } from "node:fs";
import { buildFeed, servedFeed, FEED_SCHEMA_VERSION, type PublishedFeed } from "../src/lib/website-feed-model.ts";
import { feedDigest, feedBase } from "../src/lib/website-feed.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

const NOW = Date.parse("2026-11-11T10:00:00Z");
const base = (id: string, number: string, status: string, more: Record<string, unknown> = {}) => ({
  id, number, status, type: "T", titleBg: `Заглавие ${id}`, titleEn: `Title ${id}`, objectBg: "Плочки", objectEn: "Tiles", parameters: [],
  commercial: { base: 12000, maxParticipants: 9 }, minParticipants: 5, ...more,
}) as never;
const schemes = [
  base("a", "PTS 26/01-T-1", "open", { dates: { applicationsDue: "2026-12-01" }, sentToParticipants: { plan: "x", invitation: "y" }, releasedEditions: { plan: { id: "e1", no: 2 }, invitation: { id: "e2", no: 1 } } }),
  base("b", "PTS 26/02-T-1", "draft"),
  base("c", "PTS 25/10-NA-T-2", "closed", { sentToParticipants: { plan: "x" } }),
  base("d", "ILC 26/03-C-1", "running", { type: "C" }),
];
const feed = buildFeed(schemes, () => NOW, (s: { id: string }) => s.id === "a", "https://portal.ptsbg.eu/");
const ids = feed.schemes.map((x) => x.id);
const json = JSON.stringify(feed);
t("started and finished only — never a draft (Реш. 147)", ids.join() === "a,d,c" && !json.includes("PTS 26/02-T-1"), ids.join());
t("the version of the format; the fields", feed.schema_version === FEED_SCHEMA_VERSION && JSON.stringify(Object.keys(feed.schemes[0]).sort()) === JSON.stringify(["accredited", "activity", "applicationsDue", "id", "kind", "links", "number", "object", "state", "title"]));
t("the state in words (10.1): full — a label; the deadline only while taking applications", feed.schemes[0].state.key === "full" && /Запълнена/.test(feed.schemes[0].state.bg) && feed.schemes[0].applicationsDue === "2026-12-01" && feed.schemes.find((x) => x.id === "c")!.applicationsDue === null);
t("the number's markers: the kind, the activity, the accreditation", feed.schemes.find((x) => x.id === "c")!.accredited === false && feed.schemes.find((x) => x.id === "d")!.kind === "ILC" && feed.schemes.find((x) => x.id === "d")!.activity === "C" && feed.schemes[0].accredited === true);
t("links: its public page; the plan and invitation only when released (D15) — the portal's address, no double slash", feed.schemes[0].links.page === "https://portal.ptsbg.eu/apply/a" && feed.schemes[0].links.plan === "https://portal.ptsbg.eu/apply/a/plan" && feed.schemes[0].links.invitation === "https://portal.ptsbg.eu/apply/a/invitation" && feed.schemes.find((x) => x.id === "c")!.links.plan === null);
t("never a count, the maximum, a price or a participant", !/maxParticipants|minParticipants|commercial|12000|"base"|participants/.test(json));
const pub: PublishedFeed = { ...feed, version: 3, published_at: "2026-11-11T09:00:00Z" };
const served = servedFeed(pub, new Set(["a", "c"]));
t("served: the published version, less a scheme no longer started", served.schemes.map((x) => x.id).join() === "a,c" && served.version === 3 && pub.schemes.length === 3);
// 10.2 review: the database reorders a jsonb's keys — «stale» compares fingerprints made at the build
const reordered = JSON.parse(JSON.stringify(feed), (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))) : v));
t("10.2 review: the fingerprint — the same for two builds; never taken from the JSON read back (its key order the database's)", feedDigest(buildFeed(schemes, () => NOW, (s: { id: string }) => s.id === "a", "https://portal.ptsbg.eu")) === feedDigest(feed) && JSON.stringify(reordered) !== JSON.stringify(feed) && /last\.digest !== digest/.test(src("app/website/page.tsx")) && !/sameFeed|JSON\.stringify\(last/.test(src("app/website/page.tsx")));
t("10.2 review: the links' address — the portal's own, whole and valid; else relative (refused on a deployment)", feedBase({ NEXT_PUBLIC_SITE_URL: " https://portal.ptsbg.eu/ " }) === "https://portal.ptsbg.eu" && feedBase({ NEXT_PUBLIC_SITE_URL: "portal.ptsbg.eu" }) === "" && feedBase({ VERCEL_URL: "x.vercel.app" }) === "" && feedBase({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }) === "http://localhost:3000");

// ── the wiring ──
const act = src("lib/actions.ts");
const fn = act.slice(act.indexOf("export async function publishWebsiteFeedAction("), act.indexOf("export async function publishWebsiteFeedAction(") + 1500);
t("published by the head's right (what goes out in PTS's name) — only the feed the person saw; nothing new when nothing changed; never without the portal's address on a deployment — on record with its fingerprint", /requireCapAnywhere\("texts\.approve"\)/.test(fn) && /feedDigest\(feed\)/.test(fn) && /!== digest\) redirect\("\/website\?refused=changed"\)/.test(fn) && /last\?\.digest === digest\) redirect\(`\/website\?refused=unchanged`\)/.test(fn) && /feedBaseMissing\(\)\) redirect\("\/website\?refused=no-address"\)/.test(fn) && /logActivity\("website\.published", \{ after: \{[^}]*digest/.test(fn));
const route = src("app/feed/schemes.json/route.ts");
t("the address: the last publication, never live; drafts out when served (the ids only — never the documents); never cached; a failure a 503; public in the proxy", /latestPublication\(\)/.test(route) && /servedFeed\(p\.feed, started\)/.test(route) && /listStartedSchemeIds\(\)/.test(route) && !/buildFeed|listStartedSchemes\(/.test(route) && /no-cache, max-age=0, must-revalidate/.test(route) && /status: 503/.test(route) && !/max-age=300/.test(route) && /\|feed\/\|/.test(src("proxy.ts")));
t("the page reads no commercial field (3.7)", !/\.commercial\b|maxParticipants/.test(src("app/website/page.tsx")) && !/\.commercial\b|maxParticipants/.test(src("lib/website-feed-model.ts")));

console.log(`website-feed.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
