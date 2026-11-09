import { createHash, randomUUID } from "crypto";
import { usesM1, isM1Doc, m1Problems } from "./m1-render";
import { shareOf } from "./commercial-model";
import { windowDays } from "./deadlines-model";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Scheme, Lang, UploadedDoc } from "./types";
import { getDb, noMemoryFallback } from "./supabase";
import { hasDocContent } from "./documents";
import { renderCohortDoc } from "./cohort-doc";
import { uploadedDocBytes, uploadedBytesResponse } from "./scheme-uploads";
import { docImgSrc } from "./image-hosts";
import { localizeFontLinks } from "./doc-fonts";
import { schemeNowMs, sofiaToday } from "./clock";
import { checkNote, hasEditions, nextEditionNo, stampEdition, type NoteProblem } from "./editions-model";
import { schemeMarkers } from "./scheme-number";
import { amendmentLine, type AmendedDoc } from "./amendments-model";

// The edition core (plan part 3.0; Реш. 50; Zadanie §3–4; migration 0029). Every
// document of a scheme has numbered editions — № 1, 2, 3 … — each with its date, its
// change note (the reason, and what it covers), who issued it, and the FILE it was at
// that moment, frozen: an uploaded file kept by reference (since 0.9 no stored file
// is ever deleted), or the document rendered once per language and kept as HTML in
// its own PRIVATE bucket. Each file's SHA-256 is in the record, and a file is served
// only while it still matches it. Never changed, never removed: the database refuses
// it (0029), and a change is the next edition.
//
// The participants are served an EDITION (lib/actions setDocSentAction, the lab
// route): what they hold changes only when a person issues the next one, with its
// note. This replaces the stop-gap of part 0.7 (release copies). Who received which
// edition, at which level, and every download, are part 5.4.
//
// A frozen file is rendered as the participants receive a cohort document
// (lib/cohort-doc): no names, a participants table and the portal's own scores each
// replaced by a visible note. The documents that name laboratories have no editions
// at all (lib/editions-model EDITIONLESS).

export const EDITION_BUCKET = "doc-editions";

export type EditionSource = "rendered" | "uploaded";

export interface DocEdition {
  id: string;
  schemeId: string;
  docKey: string;
  no: number;
  issuedOn: string; // yyyy-mm-dd — the edition's date, Sofia's day on the round's clock
  issuedAt: string; // ISO
  issuedBy: string; // the actor
  reason: string;   // why
  scope: string;    // what it covers ("" = not said)
  source: EditionSource;
  file?: UploadedDoc; // source "uploaded"
  bg?: string;        // source "rendered": a storage path, or a data: URL without Supabase
  en?: string;
  sha: { bg?: string; en?: string; file?: string };
  // source "rendered": what the document was MADE from (lib/editions fingerprint) — so
  // a new build of the portal, which renders the same document a little differently,
  // does not make it a new edition
  fingerprint?: string;
}

const memStore = globalThis as unknown as { __ptsEditionsMem?: DocEdition[] };
const mem: DocEdition[] = memStore.__ptsEditionsMem ?? (memStore.__ptsEditionsMem = []);

type Row = {
  id: string; scheme_id: string; doc_key: string; no: number; issued_on: string; issued_at: string; issued_by: string;
  reason: string; scope: string; source: EditionSource; file: UploadedDoc | null;
  html_bg: string | null; html_en: string | null; sha_bg: string | null; sha_en: string | null; sha_file: string | null;
  fingerprint: string | null;
};
const toRow = (e: DocEdition): Row => ({
  id: e.id, scheme_id: e.schemeId, doc_key: e.docKey, no: e.no, issued_on: e.issuedOn, issued_at: e.issuedAt, issued_by: e.issuedBy,
  reason: e.reason, scope: e.scope, source: e.source, file: e.file ?? null,
  html_bg: e.bg ?? null, html_en: e.en ?? null, sha_bg: e.sha.bg ?? null, sha_en: e.sha.en ?? null, sha_file: e.sha.file ?? null,
  fingerprint: e.fingerprint ?? null,
});
const fromRow = (r: Row): DocEdition => ({
  id: r.id, schemeId: r.scheme_id, docKey: r.doc_key, no: r.no, issuedOn: String(r.issued_on).slice(0, 10), issuedAt: r.issued_at,
  issuedBy: r.issued_by, reason: r.reason, scope: r.scope ?? "", source: r.source,
  ...(r.file ? { file: r.file } : {}), ...(r.html_bg ? { bg: r.html_bg } : {}), ...(r.html_en ? { en: r.html_en } : {}),
  sha: { ...(r.sha_bg ? { bg: r.sha_bg } : {}), ...(r.sha_en ? { en: r.sha_en } : {}), ...(r.sha_file ? { file: r.sha_file } : {}) },
  ...(r.fingerprint ? { fingerprint: r.fingerprint } : {}),
});

// by document, the latest edition first
const order = (a: DocEdition, b: DocEdition) => a.docKey.localeCompare(b.docKey) || b.no - a.no;

export const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** Every edition of a scheme — of one document, or of all — the latest first. */
export async function listEditions(schemeId: string, docKey?: string): Promise<DocEdition[]> {
  const keep = (e: DocEdition) => e.schemeId === schemeId && (!docKey || e.docKey === docKey);
  const db = getDb();
  if (!db) return mem.filter(keep).sort(order);
  try {
    let q = db.from("doc_editions").select("*").eq("scheme_id", schemeId);
    if (docKey) q = q.eq("doc_key", docKey);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow).sort(order);
  } catch (e) {
    noMemoryFallback("editions", e);
    return mem.filter(keep).sort(order);
  }
}

export async function getEdition(id: string): Promise<DocEdition | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const db = getDb();
  if (!db) return mem.find((e) => e.id === id) ?? null;
  try {
    const { data, error } = await db.from("doc_editions").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : null;
  } catch (e) {
    noMemoryFallback("editions", e);
    return mem.find((x) => x.id === id) ?? null;
  }
}

export async function latestEdition(schemeId: string, docKey: string): Promise<DocEdition | null> {
  return (await listEditions(schemeId, docKey))[0] ?? null;
}

// ── what the document is NOW ─────────────────────────────────────────────────
export type Frozen =
  | { source: "uploaded"; file: UploadedDoc; bytes: Uint8Array }
  | { source: "rendered"; bg: string; en: string; fingerprint: string };

// What a rendered document is made from: the scheme as its documents print it, the
// skin, and this document's own body, form values and choice of version. Left out:
// what never reaches a document — the round's operational record (releases, the
// chain, reminders, the laboratories' uploads, applications, certificates, the test
// clock, the working dates, status, archiving, the folder) and the OTHER documents.
const NOT_IN_DOCUMENTS = new Set<string>([
  "sentToParticipants", "releasedEditions", "testClock", "chain", "remindedAt", "certificates", "labUploads", "labDocs",
  "applications", "supersededFiles", "archivedAt", "archivedBy", "paidAt", "docReady", "dates", "status", "folderId",
  "docs", "composed", "formData", "docActive", "uploads", "lifecycle", "amendments", "extensions", "batches", "characteristicVersions", "characteristicSeq", "pointSeq", "staticReminder", "commercial", "lists", "period", "deliveries", "deliveryMinDays",
  // the folder's display name — no document prints it
  "name",
  // the releases to one participation or one user (5.4) and the coding act's record (5.3):
  // the round's operational record, printed by no document
  "releases", "coding",
]);
// the results entered and scored: printed only by the report and the results sheets —
// to any other document (the plan, the invitation) a result saved is not a change
const PRINTS_SCORING = new Set<string>(["report", "results", "results-coded"]);
const UNPRINTED_PARAM_FIELDS = new Set<string>(["id", "unit", "step", "guardMin", "guardMax", "uRequired", "group", "groupEn", "determinations", "engine"]);
const MARKER_FIELDS = new Set<string>(["kind", "activity", "accredited"]);
const stable = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stable)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
  : v;

/** The fingerprint of what this document is made from — the same for the same
 *  content whatever build of the portal renders it. */
export const TEMPLATE_VERSION: Record<string, number> = { instruction: 2 };
export function fingerprint(scheme: Scheme, docKey: string): string {
  // the kind, activity and accreditation as they read (3.1): a scheme from before they
  // were kept as fields, and the same scheme once they are, are one content
  const rest: Record<string, unknown> = Object.fromEntries(Object.entries(scheme).filter(([k]) => !NOT_IN_DOCUMENTS.has(k) && !MARKER_FIELDS.has(k) && (k !== "scoring" || PRINTS_SCORING.has(docKey))));
  // the characteristics' fields of part 3.6 no document prints — their ids, the 2.0
  // fields, the guard limits, the group … — are not a document's content: storing them
  // is no change of any document (when a renderer starts printing one, take it out here)
  if (Array.isArray(rest.parameters)) rest.parameters = (rest.parameters as Record<string, unknown>[]).map((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !UNPRINTED_PARAM_FIELDS.has(k))));
  if (rest.calibration && typeof rest.calibration === "object") { const c = { ...(rest.calibration as Record<string, unknown>) }; delete c.pointIds; rest.calibration = c; }
  return sha256(JSON.stringify(stable({
    v: 1, docKey, scheme: rest, markers: schemeMarkers(scheme),
    // a template changed under П 8.3 is a change of the documents made from it — the
    // Instruction since 3.11 (its contacts from the team, Реш. 150's sentence)
    ...(TEMPLATE_VERSION[docKey] ? { tv: TEMPLATE_VERSION[docKey] } : {}),
    // what an M1 document prints from fields kept out of the documents' content — the
    // share of a second participation, the days at a participant (3.10 review)
    ...(usesM1(scheme) ? { m1: { share: shareOf(scheme.commercial), window: windowDays(scheme) } } : {}),
    body: scheme.docs?.[docKey] ?? null, composed: scheme.composed?.[docKey] ?? null,
    form: scheme.formData?.[docKey] ?? null, active: scheme.docActive?.[docKey] ?? null,
  })));
}

/** The document as it would be issued now: the uploaded file when that is the active
 *  version, else the built document (or its template) rendered in both languages.
 *  The final report is only ever PTS's uploaded file — the portal's own render carries
 *  scores it computed (Реш. 135, part 0.6). null: nothing in it yet. Throws when an
 *  uploaded file cannot be read. */
export async function freezeNow(scheme: Scheme, docKey: string): Promise<Frozen | null> {
  const up = scheme.uploads?.[docKey];
  const preferBuilt = docKey !== "report" && scheme.docActive?.[docKey] === "built" && hasDocContent(scheme, docKey);
  if (up && !preferBuilt) {
    const got = await uploadedDocBytes(up);
    if (!got) throw new Error(`the uploaded file of “${docKey}” cannot be read`);
    return { source: "uploaded", file: up, bytes: got.bytes };
  }
  if (docKey === "report" || !hasDocContent(scheme, docKey)) return null;
  const [bg, en] = await Promise.all([renderCohortDoc(scheme, docKey, "bg"), renderCohortDoc(scheme, docKey, "en")]);
  if (!bg && !en) return null;
  return { source: "rendered", bg, en, fingerprint: fingerprint(scheme, docKey) };
}

/** Is the document now what this edition froze? An uploaded file: the same bytes. A
 *  rendered one: made from the same content (its fingerprint) — or, failing that,
 *  rendering to the same bytes (the same document stamped with the same edition is
 *  the same bytes). A new build that renders it differently is not a new edition. */
export function sameAs(now: Frozen, ed: DocEdition, amendment?: { bg: string; en: string }): boolean {
  if (now.source !== ed.source) return false;
  if (now.source === "uploaded") return !!ed.sha.file && sha256(now.bytes) === ed.sha.file;
  if (ed.fingerprint && now.fingerprint === ed.fingerprint) return true;
  // the bytes as that edition was stamped — with its amendment's line when it is an
  // amendment's edition (3.3)
  return sha256(stampEdition(now.bg, "bg", ed.no, ed.issuedOn, amendment?.bg)) === ed.sha.bg
    && sha256(stampEdition(now.en, "en", ed.no, ed.issuedOn, amendment?.en)) === ed.sha.en;
}

/** The amendment line an edition was stamped with (3.3), from the scheme's record of its
 *  amendments — or undefined for an edition no amendment issued. */
export function amendmentStampFor(scheme: Pick<Scheme, "amendments">, ed: Pick<DocEdition, "id" | "docKey"> | null | undefined): { bg: string; en: string } | undefined {
  if (!ed) return undefined;
  for (const a of scheme.amendments ?? []) {
    const e = a.editions?.[ed.docKey as AmendedDoc];
    if (e?.id === ed.id) {
      const r = e.replaces ? { issuedOn: e.replaces.issuedOn } : undefined;
      return { bg: amendmentLine("bg", a, r), en: amendmentLine("en", a, r) };
    }
  }
  return undefined;
}

/** Can this edition still be served — its file(s) in storage, the bytes recorded? An
 *  edition that cannot is never reused: the same content is issued again as the next. */
export async function servable(ed: DocEdition): Promise<boolean> {
  const langs: Lang[] = ed.source === "uploaded" ? ["bg"] : ["bg", "en"];
  for (const l of langs) if ((await editionContent(ed, l)).kind !== (ed.source === "uploaded" ? "file" : "html")) return false;
  return true;
}

/** Why an edition is issued again with the same content. */
export const reissueReason = (no: number) =>
  `Файлът на редакция № ${no} липсва или не съвпада със записа — същото съдържание е издадено отново като следващата редакция.`;

// ── issuing ──────────────────────────────────────────────────────────────────
async function ensureBucket(db: SupabaseClient): Promise<void> {
  const { data: bucket } = await db.storage.getBucket(EDITION_BUCKET);
  // made public by hand, every frozen file would be open at a guessable address: refuse
  if (bucket?.public) throw new Error(`the ${EDITION_BUCKET} bucket is public — make it private first`);
  if (!bucket) {
    const { error } = await db.storage.createBucket(EDITION_BUCKET, { public: false, fileSizeLimit: "16MB", allowedMimeTypes: ["text/html"] });
    if (error && !/exist/i.test(error.message)) throw error;
  }
}

export type IssueProblem = NoteProblem | "empty" | "conflict" | "failed" | "editionless" | "incomplete";

/** Issue the next edition of a document from what it is now (`frozen`), with its note.
 *  Refused: a document without editions, one with nothing in it, edition 2+ without a
 *  reason, and two issued at the same moment (the second is told). */
export async function issueEdition(p: {
  scheme: Scheme; docKey: string; frozen: Frozen | null; reason?: string; scope?: string; by: string;
  /** an amendment's line in each language, stamped beside the edition's (3.3) */
  amendment?: { bg: string; en: string };
}): Promise<{ ok: true; edition: DocEdition } | { ok: false; error: IssueProblem; no?: number }> {
  const { scheme, docKey, frozen } = p;
  if (!hasEditions(docKey)) return { ok: false, error: "editionless" };
  if (!frozen) return { ok: false, error: "empty" };
  // a calibration document on M1 is issued whole — whatever path issues it: «Изпрати»,
  // «Издай нова редакция», an amendment, a lifecycle act (3.10 review)
  if (frozen.source === "rendered" && usesM1(scheme) && isM1Doc(docKey)
    && (m1Problems(frozen.bg, docKey, "bg", scheme).length || m1Problems(frozen.en, docKey, "en", scheme).length)) return { ok: false, error: "incomplete" };
  const latest = await latestEdition(scheme.id, docKey);
  const no = nextEditionNo(latest);
  const note = checkNote(no, p.reason, p.scope);
  if (!note.ok) return { ok: false, error: note.problem, no };
  const issuedOn = sofiaToday(schemeNowMs(scheme));
  const edition: DocEdition = {
    id: randomUUID(), schemeId: scheme.id, docKey, no, issuedOn, issuedAt: new Date().toISOString(), issuedBy: p.by,
    reason: note.reason, scope: note.scope, source: frozen.source, sha: {},
    ...(frozen.source === "rendered" ? { fingerprint: frozen.fingerprint } : {}),
  };
  const db = getDb();
  const stored: string[] = [];
  try {
    if (frozen.source === "uploaded") {
      edition.file = frozen.file;
      edition.sha.file = sha256(frozen.bytes);
    } else {
      if (db) await ensureBucket(db);
      for (const lang of ["bg", "en"] as const) {
        const html = stampEdition(frozen[lang], lang, no, issuedOn, p.amendment?.[lang]);
        edition.sha[lang] = sha256(html);
        if (!db) {
          edition[lang] = `data:text/html;base64,${Buffer.from(html, "utf8").toString("base64")}`;
          continue;
        }
        const path = `${scheme.id}/${docKey}/${no}-${edition.id}-${lang}.html`;
        const { error } = await db.storage.from(EDITION_BUCKET).upload(path, Buffer.from(html, "utf8"), { contentType: "text/html", upsert: false });
        if (error) throw error;
        stored.push(path);
        edition[lang] = path;
      }
    }
    if (!db) {
      // the same rules the database keeps (0029): the next number, once
      if (nextEditionNo(mem.filter((e) => e.schemeId === scheme.id && e.docKey === docKey).sort(order)[0]) !== no) return { ok: false, error: "conflict" };
      mem.push(edition);
      return { ok: true, edition };
    }
    const { error } = await db.from("doc_editions").insert(toRow(edition));
    if (error) {
      const code = (error as { code?: string }).code;
      throw Object.assign(new Error(error.message), { conflict: code === "23505" || /next edition/i.test(error.message) });
    }
    return { ok: true, edition };
  } catch (e) {
    // a file kept for an edition that was never recorded belongs to nothing — but an
    // error after the row was written (a lost connection) must not take its files
    if (db && stored.length) {
      const { data: row, error: readErr } = await db.from("doc_editions").select("id").eq("id", edition.id).maybeSingle();
      if (row) return { ok: true, edition };
      if (!readErr) await db.storage.from(EDITION_BUCKET).remove(stored).catch(() => {});
    }
    if ((e as { conflict?: boolean }).conflict) return { ok: false, error: "conflict" };
    console.warn("[editions] could not issue:", (e as Error)?.message ?? e);
    return { ok: false, error: "failed" };
  }
}

// ── serving ──────────────────────────────────────────────────────────────────
async function readHtml(ref: string): Promise<string | null> {
  if (ref.startsWith("data:")) {
    const m = ref.match(/^data:text\/html;base64,(.*)$/);
    return m ? Buffer.from(m[1], "base64").toString("utf8") : null;
  }
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db.storage.from(EDITION_BUCKET).download(ref);
  if (error || !data) return null;
  return await data.text();
}

/** An edition's file in one language, checked against its record: "missing" when it
 *  is not in storage, "altered" when its bytes are not the ones recorded. */
export async function editionContent(ed: DocEdition, lang: Lang): Promise<
  { kind: "html"; html: string } | { kind: "file"; bytes: Uint8Array; mime: string; name: string } | { kind: "missing" } | { kind: "altered" }
> {
  if (ed.source === "uploaded") {
    if (!ed.file) return { kind: "missing" };
    const got = await uploadedDocBytes(ed.file);
    if (!got) return { kind: "missing" };
    if (sha256(got.bytes) !== ed.sha.file) return { kind: "altered" };
    return { kind: "file", bytes: got.bytes, mime: got.mime, name: ed.file.name };
  }
  const ref = lang === "en" ? ed.en : ed.bg;
  const html = ref ? await readHtml(ref) : null;
  if (html === null) return { kind: "missing" };
  if (sha256(html) !== ed.sha[lang]) return { kind: "altered" };
  return { kind: "html", html };
}

/** Serve an edition's file. The caller does authorization; this moves the bytes —
 *  only those recorded (and points the fonts of a file frozen with an outside
 *  stylesheet at the portal's own; the kept file is unchanged). */
export async function editionResponse(ed: DocEdition, lang: Lang, download: boolean): Promise<Response> {
  const c = await editionContent(ed, lang);
  if (c.kind === "missing") return new Response("Not found", { status: 404 });
  if (c.kind === "altered") {
    console.error(`[editions] the stored file of edition ${ed.no} of “${ed.docKey}” (${ed.schemeId}, ${lang}) is not the one recorded — not served`);
    return new Response("This edition's stored file does not match its record, so it is not served. Tell the software administrator.", { status: 500 });
  }
  if (c.kind === "file") return uploadedBytesResponse(c.bytes, c.mime, c.name, download);
  const html = c.html;
  return new Response(localizeFontLinks(html), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${ed.docKey}-edition-${ed.no}-${lang}.html"`,
      "content-security-policy":
        `default-src 'none'; img-src ${docImgSrc()}; style-src 'unsafe-inline' 'self'; font-src 'self'; frame-ancestors 'self'`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
