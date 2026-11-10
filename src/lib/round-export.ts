import type { Scheme, Participant, UploadedDoc, SupersededFile, CaseEvent, Notification, ActivityEvent, DocRevision, Lab, Lang } from "./types";
import { schemeMeta, providerRows } from "./scheme-meta";
import { currentHomogeneity } from "./batches-model";
import { listsOf } from "./scheme-lists-model";
import type { SentMessage } from "./sent-messages";
import { getSchemeIncludingArchived } from "./store";
import { listParticipants, withIdentities } from "./participants";
import { listOpenings } from "./identity-store";
import { openParticipationSnapshots, inForce, openRoundParties } from "./participation-snapshots";
import { listCaseEventsForScheme } from "./case-events";
import { listNoticesForScheme } from "./notifications";
import { pointKeys } from "./reference-values-model";
import { listSubmissions, listCorrections } from "./submissions";
import { codedSubmissionData, submissionIdentity } from "./results-model";
import { listSentForScheme } from "./sent-messages";
import { listActivityForScheme } from "./activity-store";
import { listRevisionsForScheme } from "./doc-revisions";
import { getLab } from "./labs";
import { listDesignations } from "./processing-roles";
import { listSchemeRoles } from "./scheme-roles";
import { redactActivityForStaff, redactCaseEventForStaff } from "./redact";
import { DOCUMENTS, isListDoc, pairsNamesWithCodes, savedDocBody } from "./documents";
import { hasCohortNames } from "./doc-release";
import { renderCohortDoc } from "./cohort-doc";
import { docPrintHtml, docDefaultBody } from "./doc-template";
import { resolveSkinAsync } from "../skins";
import { SCHEME_DOC_BUCKET } from "./scheme-uploads";
import { EDITION_BUCKET, listEditions, sha256 } from "./editions";
import { getDb } from "./supabase";
import { zip, type ZipEntry } from "./zip";

// ─────────────────────────────────────────────────────────────────────────────
// «Изнеси целия кръг» (plan part 1.10, Реш. 136 — PTS: «the most important
// requirement»). One ZIP with everything of one round, so it can go on on paper if
// the portal is ever dropped mid-round: a table per kind of record, the files, every
// document as a printable page, and a README of the format.
//
// TWO PARTS, as separate files: coded/ (everything by participant code — what the
// statistics expert may be given alone) and identity/ (who is behind each code, the
// addresses, the certificates' numbers, the file names, the laboratory accounts).
// The coded part never carries a laboratory's name, address, phone, account id,
// file name or certificate number — a number and a code together are a lookup in
// the register (Реш. 115). Two lines of defence: what is identity is placed in
// identity/ by field; and every value of the round known to identify a laboratory
// is scrubbed out of every text in coded/ before it is written (old rows, free text).
//
// WHOLE, OR NOT MADE: a database or storage error stops the export; only a file
// that is recorded but truly not in storage is listed as missing (README), and the
// ZIP's name then says INCOMPLETE.
//
// COVERAGE: every database table and storage bucket is in the round export or named
// as not round data, with why; every field of a scheme and a participant has its
// part. scripts/round-export.test.ts fails on anything nobody placed.
// ─────────────────────────────────────────────────────────────────────────────

export const EXPORT_FORMAT = "pts-round-export/1";
export type Part = "coded" | "identity";

/** Each database table that holds round data, and the files of the export that carry it. */
export const ROUND_TABLES: Record<string, string[]> = {
  schemes: ["coded/scheme.json", "coded/results.csv", "coded/assigned.csv", "identity/scheme-identity.json", "identity/certificates.csv", "identity/applications.csv"],
  participants: ["coded/codes.csv", "identity/participants.csv"],
  // the identity store (2.3): who is behind each code, and every opening of it
  "identity.participants": ["identity/participants.csv"],
  "identity.openings": ["identity/identity_openings.csv"],
  // each participation's frozen copy of its legal entity and laboratory (4.5, J12)
  "identity.participation_snapshots": ["identity/participation_snapshots.csv"],
  // the round's legal entities, their laboratories and users, as they are on the day of
  // the export (4.8) — the copy at the participation is participation_snapshots.csv
  "identity.legal_entities": ["identity/entities.csv"],
  "identity.laboratories": ["identity/laboratories.csv"],
  "identity.entity_users": ["identity/entity_users.csv"],
  case_events: ["coded/case_events.csv"],
  notifications: ["coded/notices.csv", "identity/notice_recipients.csv"],
  sent_messages: ["coded/messages.csv", "identity/message_recipients.csv"],
  activity_log: ["coded/journal.csv", "identity/journal_full.csv"],
  doc_revisions: ["coded/doc_revisions.csv", "identity/doc_revisions_named.csv"],
  // the accounts of the laboratories IN this round (invoice data, contacts)
  labs: ["identity/labs.csv"],
  // who held which role in the round, from its Order (2.1) — PTS's own people
  scheme_roles: ["coded/scheme_roles.csv"],
  // who processes, reviews and approves the round, and every earlier designation (2.5)
  processing_roles: ["coded/processing_roles.csv"],
  // every edition of the round's documents and its frozen file (3.0) — none names a laboratory
  doc_editions: ["coded/editions.csv"],
  // the submitted versions of the participations' results (6.1–6.4) — the account that
  // submitted is a person's: identity/ only
  submissions: ["coded/submissions.csv", "identity/submissions_by.csv"],
  // the coding expert's corrections next to the versions (6.5): reported and used, the reason —
  // by PTS's people, by code (as the unlocks)
  result_corrections: ["coded/result_corrections.csv"],
};

/** Each database table that is NOT round data, and why. */
export const NOT_ROUND_TABLES: Record<string, string> = {
  app_environment: "which portal the database belongs to (1.2)",
  submission_drafts: "a participation's draft of its results, as typed (6.1) — no record, never read by PTS; what is SUBMITTED is (submissions)",
  app_migrations: "which migrations the database has (1.1)",
  notification_reads: "who read which notice in the portal, per person (4.6) — the bell's state; the notices themselves are in notices.csv",
  app_settings: "the portal's own settings",
  change_register: "changes to the portal itself — releases, updates, settings (1.11) — across rounds",
  custom_skins: "visual skins; the round names its skin in scheme.json, and its documents are rendered with it",
  doc_templates: "reusable document templates, across rounds",
  folders: "PTS's grouping of schemes; the round names its folder in scheme.json",
  lab_applications: "requests for a laboratory ACCOUNT — across rounds, not a round",
  library_items: "the reusable library, across rounds",
  reminder_templates: "the reminder texts, across rounds; the words each laboratory was actually sent are in messages.csv",
  staff_users: "PTS's own people; they are named in the journal",
  staff_declarations: "PTS's own people's Ф 4.2-1 (2.8) — per person, across rounds",
  holiday_entries: "PTS's holiday calendar (3.4) — the working days of every round, not one round's",
  staff_declaration_voids: "the voidings of those declarations, with the reason (2.8)",
};

/** The storage buckets: which hold round files. */
export const ROUND_BUCKETS = ["scheme-docs", EDITION_BUCKET, "skin-assets"];
export const NOT_ROUND_BUCKETS: Record<string, string> = {
  "lab-docs": "documents of laboratory ACCOUNT requests — across rounds",
  "round-exports": "the exports themselves, kept briefly for their download",
  "staff-declarations": "the signed Ф 4.2-1 of PTS's own people (2.8) — per person, across rounds",
  "entity-proofs": "a legal entity's registration document (4.1) — per entity, across rounds",
};

// Every field of a scheme has its part. "split": kept in coded/ without names,
// storage paths and uploaders; whole in identity/.
type SchemePart = "coded" | "identity" | "split";
export const SCHEME_FIELDS = {
  id: "coded", number: "coded", type: "coded", kind: "coded", activity: "coded", accredited: "coded", lifecycle: "coded", amendments: "coded", extensions: "coded", batches: "coded", characteristicVersions: "coded", characteristicSeq: "coded", pointSeq: "coded", staticReminder: "coded", commercial: "coded", lists: "coded", calTemplate: "coded", period: "coded", externalProviders: "coded", status: "coded", titleEn: "coded", titleBg: "coded", objectEn: "coded", objectBg: "coded",
  coverImage: "coded", coverImageWidth: "coded", coverImageAlign: "coded", distribution: "coded", formNumber: "coded", revision: "coded",
  revisionDate: "coded", standard: "coded", regNo: "coded", orderDate: "coded", minParticipants: "coded", team: "coded", partner: "coded",
  parameters: "coded", resultTables: "coded", schedule: "coded", prices: "coded", assignedValueMethodEn: "coded", assignedValueMethodBg: "coded",
  scoresEn: "coded", scoresBg: "coded", clauses: "coded", calibration: "coded", scoring: "coded", testClock: "coded",
  formData: "coded", docActive: "coded", docReady: "coded", sentToParticipants: "coded", releasedEditions: "coded", archivedAt: "coded", archivedBy: "coded",
  paidAt: "coded", dates: "coded", chain: "coded", remindedAt: "coded", coding: "coded", deliveryMinDays: "coded",
  // the reference laboratory's values per point (5.7) — the device's, no participant's
  referenceValues: "coded",
  // shipments and receipts by participation id; who received an object, a hand-over's
  // receiver, remarks and a problem's words are a person's — and an entity user's account
  // id is the same in every round: kept only in identity/ (5.6)
  deliveries: "split",
  // which documents ask for an acknowledgement (5.9) — set by PTS's staff
  ackRequired: "coded",
  // the acknowledgements and the declaration's ticks (5.9): the participation, the document,
  // the edition and its hash, the moment — but the account that gave it is an entity user's,
  // the same in every round: kept only in identity/
  acknowledgements: "split",
  // the messages PTS's people wrote (5.10): the target, who, when — coded; the text a person
  // wrote may name someone: whole only in identity/ (the notices go through the scrubber)
  messages: "split",
  // the unlocks of a participation's form after the deadline (6.4) — by PTS's people, with the reason
  resultUnlocks: "coded",
  // a release to one user names that user (an entity user's id is the same in every round):
  // its user kept only in identity/ (5.4 review)
  releases: "split", skin: "coded", name: "coded", folderId: "coded",
  // a certificate's number with its code is a register lookup → the lab (Реш. 115)
  certificates: "identity",
  // the scheme's заявки name the laboratories
  applications: "identity",
  // a saved document may carry names; files carry names and uploaders
  composed: "split", docs: "split", uploads: "split", labUploads: "split", labDocs: "split",
  supersededFiles: "split",
} satisfies Record<keyof Scheme, SchemePart>;

export const PARTICIPANT_FIELDS = {
  id: "coded", schemeId: "coded", code: "coded", status: "coded", sampleCode: "coded", characteristics: "coded",
  // the application's counts per characteristic (5.1)
  selections: "coded",
  // a refusal, annulment or withdrawal (5.1): its state, date, who and category coded;
  // its reason and source may name someone — whole only in identity/ (5.1 review)
  standing: "split",
  labName: "identity", contact: "identity", email: "identity", phone: "identity", country: "identity",
  // the participations follow from the coded counts (5.1) and sit in the coded table
  participations: "coded",
  // when it was entered (5.8) — a moment, no one's name
  createdAt: "coded",
  deliveryAddress: "identity", courier: "identity", labId: "identity",
} satisfies Record<keyof Participant, Part | "split">;

/** A participation's standing as the coded part holds it — never its reason or source. */
export const codedStanding = (st: Participant["standing"]) => (st ? { state: st.state, at: st.at, by: st.by, ...(st.category ? { category: st.category } : {}) } : undefined);

// ── tables ───────────────────────────────────────────────────────────────────
const BOM = "﻿"; // Excel opens UTF-8 CSV as such only with it
// A text cell starting with = + - @ (or a tab / return) is a formula to Excel — a
// laboratory's name from the public form could run on opening. Such a cell gets a
// leading apostrophe; a number never does (a result may be negative).
const FORMULA = /^[=+\-@\t\r]/;
const cell = (v: unknown): string => {
  let s = v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (typeof v === "string" && FORMULA.test(s) && !/^[+-]?\d+([.,]\d+)?([eE][+-]?\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** The columns: the ones named first, then every other key the rows have — a new field is never dropped. */
export function columnsOf(rows: object[], first: string[]): string[] {
  const rest = new Set<string>();
  // a field left out on purpose (set undefined — an address, an account) is no column at all
  for (const r of rows) for (const k of Object.keys(r)) if (!first.includes(k) && (r as Record<string, unknown>)[k] !== undefined) rest.add(k);
  return [...first, ...[...rest].sort()];
}
export function csv(columns: string[], rows: object[]): string {
  return BOM + [columns.join(","), ...rows.map((r) => columns.map((c) => cell((r as Record<string, unknown>)[c])).join(","))].join("\r\n") + "\r\n";
}
const table = (rows: object[], first: string[]) => csv(columnsOf(rows, first), rows);

// ── the scrubber: no identifying value of the round in coded/ ────────────────
const HIDDEN = "‹скрито · hidden›";
// A value is hidden as a whole word (4.8 review): «Русе» hides «Русе», never part of
// «Русенския»; a number of fewer than 8 digits is no laboratory's (an ЕИК or a VAT
// number is longer) and is left alone, so results, dates and hashes are never touched.
// The scrubber counts what it hid (the README says how many).
export type Scrubber = ((s: string) => string) & { hits: () => number };
export function makeScrubber(tokens: (string | undefined | null)[]): Scrubber {
  const shortNumber = (x: string) => /^[\d\s.,/-]+$/.test(x) && (x.match(/\d/g) ?? []).length < 8;
  const list = [...new Set(tokens.map((x) => (x ?? "").trim()).filter((x) => x.length >= 4 && !shortNumber(x)))].sort((a, b) => b.length - a.length);
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = list.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${list.map(esc).join("|")})(?![\\p{L}\\p{N}_])`, "giu") : null;
  // and any address that is not PTS's own
  const mail = /[^\s@<>()"'“”„,;:]+@(?!ptsbg\.eu\b)[^\s@<>()"'“”„,;:]+\.[a-z]{2,}/gi;
  let n = 0;
  const fn = (s: string) => (re ? s.replace(re, () => { n++; return HIDDEN; }) : s).replace(mail, () => { n++; return "‹address›"; });
  return Object.assign(fn, { hits: () => n });
}
export const scrubDeep = <T>(v: T, scrub: (s: string) => string): T =>
  (typeof v === "string" ? scrub(v) : Array.isArray(v) ? v.map((x) => scrubDeep(x, scrub)) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDeep(x, scrub)])) : v) as T;

// a document whose saved body or content names laboratories never goes to coded/
const namesDoc = (doc: string) => isListDoc(doc) || pairsNamesWithCodes(doc);
const bodyHasNames = (doc: string, b?: { bg?: string; en?: string }) => namesDoc(doc) || hasCohortNames(b?.bg ?? "") || hasCohortNames(b?.en ?? "");

// a proforma's or an invoice's number is the accounting software's, no name (5.8)
const fileMeta = (f?: UploadedDoc) => (f ? { mime: f.mime, size: f.size, uploadedAt: f.uploadedAt, ...(f.number ? { number: f.number } : {}) } : undefined);
const mapValues = <T, U>(o: Record<string, T> | undefined, f: (v: T) => U) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)])) : undefined);

/** The scheme as the coded part may hold it (before scrubbing). */
export function codedScheme(s: Scheme): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, part] of Object.entries(SCHEME_FIELDS) as [keyof Scheme, SchemePart][]) {
    const v = s[k];
    if (v === undefined || part === "identity") continue;
    if (part === "coded") { out[k] = v; continue; }
    switch (k) {
      case "composed": out[k] = Object.fromEntries(Object.entries(s.composed ?? {}).filter(([doc]) => !namesDoc(doc))); break;
      case "docs": out[k] = Object.fromEntries(Object.entries(s.docs ?? {}).filter(([doc, b]) => !bodyHasNames(doc, b))); break;
      case "uploads": out[k] = mapValues(s.uploads, fileMeta); break;
      case "labUploads": out[k] = mapValues(s.labUploads, (slots) => mapValues(slots as Record<string, UploadedDoc>, fileMeta)); break;
      case "labDocs": out[k] = mapValues(s.labDocs, (slots) => mapValues(slots as Record<string, UploadedDoc>, fileMeta)); break;
      case "supersededFiles": out[k] = (s.supersededFiles ?? []).map((x) => ({ where: x.where, at: x.at, reason: x.reason, file: fileMeta(x.file) })); break;
      case "releases": out[k] = (s.releases ?? []).map(({ userId: _u, ...r }) => r); break;
      case "deliveries": out[k] = codedDeliveries(s.deliveries); break;
      case "acknowledgements": out[k] = (s.acknowledgements ?? []).map(({ by: _b, ...a }) => a); break;
      case "messages": out[k] = (s.messages ?? []).map(({ bg: _b, en: _e, ...m }) => m); break;
    }
  }
  return out;
}

/** Delivery and receipt as the coded part holds them (5.6): what went, when, with which
 *  waybill and documents, fit or not — never the carrier, who received it, a hand-over's
 *  receiver, the remarks, a replacement's reason, a problem's words, or which account
 *  entered them. */
export const codedDeliveries = (d: Scheme["deliveries"]) => d === undefined ? undefined : Object.fromEntries(Object.entries(d).map(([pid, x]) => [pid, {
  // the carrier is a participant's own (its courier is identity here too) — a hand-over's
  // may be its own person: kept only in identity/ (5.6 review)
  shipments: (x.shipments ?? []).map(({ handover, reason: _why, carrier: _c, ...sh }) => ({ ...sh, ...(handover ? { handover: { time: handover.time } } : {}) })),
  receipts: (x.receipts ?? []).map(({ by: _b, receivedBy: _r, remarks: _m, ...r }) => r),
  problems: (x.problems ?? []).map((pr) => ({ id: pr.id, at: pr.at, ...(pr.resolved ? { resolvedAt: pr.resolved.at } : {}) })),
}]));

/** What the identity part holds of the scheme: the identity fields, and the split ones whole. */
export function identityScheme(s: Scheme): Record<string, unknown> {
  const out: Record<string, unknown> = { id: s.id, number: s.number };
  for (const [k, part] of Object.entries(SCHEME_FIELDS) as [keyof Scheme, SchemePart][]) {
    if (part !== "coded" && s[k] !== undefined) out[k] = s[k];
  }
  // a dev upload keeps its bytes inline: the file is in files/, not twice here
  return JSON.parse(JSON.stringify(out, (key, v) => (key === "path" && typeof v === "string" && v.startsWith("data:") ? "(inline — see files/)" : v)));
}

const pick = <T extends object>(o: T, keys: string[]) => Object.fromEntries(keys.map((k) => [k, (o as Record<string, unknown>)[k]]));
const CODED_P = Object.entries(PARTICIPANT_FIELDS).filter(([, p]) => p === "coded").map(([k]) => k);

// ── files: a storage error stops the export; only «not found» is missing ─────
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "text/html": "html" };
const ext = (mime: string) => EXT[mime] ?? "bin";
const safe = (s: string) => s.replace(/[^\w.\-]+/g, "_");
const notFound = (e: { message?: string; statusCode?: string | number; status?: number }) =>
  /not.?found|does not exist|no such/i.test(e.message ?? "") || String(e.statusCode ?? e.status ?? "") === "404";

async function storageBytes(bucket: string, path: string): Promise<Uint8Array | null> {
  if (path.startsWith("data:")) {
    const m = path.match(/^data:[^;,]*;base64,(.*)$/);
    return m ? new Uint8Array(Buffer.from(m[1], "base64")) : null;
  }
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error) { if (notFound(error as never)) return null; throw new Error(`storage (${bucket}): ${error.message}`); }
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}
const fileBytes = (up: UploadedDoc) => storageBytes(SCHEME_DOC_BUCKET, up.path);
const htmlBytes = (ref: string) => storageBytes(EDITION_BUCKET, ref);

// images the documents show (the cover, pictures put in by the editor) live in the
// public skin-assets bucket, linked by URL — they go with the round, or the pages lose them
const IMG = /\/storage\/v1\/object\/public\/skin-assets\/([^"')\s?#<>]+)/g;

// ── the export ───────────────────────────────────────────────────────────────
export interface RoundExport { zip: Uint8Array; files: string[]; missing: string[]; scheme: Scheme }

export async function buildRoundExport(schemeId: string, want: "all" | "coded", now: Date = new Date(), actor = "system:export"): Promise<RoundExport | null> {
  // an archived round can be exported too — that is what an archive is for
  const s = await getSchemeIncludingArchived(schemeId);
  if (!s) return null;
  // every read throws on a database error: the export is whole, or it is not made
  const [coded, events, notices, messages, journal, revisions, submitted, corrected] = await Promise.all([
    listParticipants(schemeId), listCaseEventsForScheme(schemeId),
    listNoticesForScheme(schemeId), listSentForScheme(schemeId), listActivityForScheme(schemeId), listRevisionsForScheme(schemeId),
    listSubmissions(schemeId), listCorrections(schemeId),
  ]);
  // who is behind each code — to scrub it from coded/ (the coded part too) and to
  // export it in identity/: an opening of the identity store, on record (2.3)
  const participants = await withIdentities(coded, schemeId, { actor, purpose: "export" });
  const labs = (await Promise.all([...new Set(participants.map((p) => p.labId).filter(Boolean) as string[])].map((id) => getLab(id)))).filter(Boolean) as Lab[];
  // each participation's frozen copy (4.5) — an opening too; its values scrubbed from coded/
  const snapshots = await openParticipationSnapshots({ actor, purpose: "export" }, schemeId);
  // the round's legal entities — of its participations' copies — with their laboratories
  // and users, as they are today (4.8): one reading, recorded against the round (review)
  const { entities: roundEntities, laboratories: roundLabs, users: roundUsers } = await openRoundParties({ actor, purpose: "export" }, schemeId);

  // every value of this round that identifies a laboratory — none of it in coded/
  const labFileNames = [
    ...Object.values(s.labUploads ?? {}).flatMap((slots) => Object.values(slots ?? {}).map((u) => u?.name)),
    ...Object.values(s.labDocs ?? {}).flatMap((slots) => Object.values(slots ?? {}).map((u) => u?.name)),
    ...(s.supersededFiles ?? []).map((x) => x.file.name),
  ];
  const scrub = makeScrubber([
    ...participants.flatMap((p) => [p.labName, p.contact, p.email, p.phone, p.deliveryAddress, p.labId]),
    // the names a laboratory typed on its own calibration form (6.2, rule 3) — scrubbed from the
    // coded part wherever they recur (the method, the other conditions: review)
    ...submitted.flatMap((x) => { const g = (x.data as { general?: Record<string, unknown> } | null)?.general; return [g?.labName, g?.signedBy].map((v) => (typeof v === "string" ? v : undefined)); }),
    ...labs.flatMap((l) => [l.name, l.email, l.phone, l.contactPerson, l.registeredAddress, l.eik, l.vat, l.mol, l.accreditationCert, l.id, l.authUserId]),
    ...(s.applications ?? []).flatMap((a) => [a.labName, a.companyName, a.contactPerson, a.manager, a.email, a.phone, a.eik, a.vat, a.mol, a.registeredAddress, a.deliveryAddress, a.accreditationCert, a.labId]),
    ...Object.values(s.certificates ?? {}).map((c) => c.no),
    ...snapshots.flatMap((x) => [x.entity.name, x.entity.eik, x.entity.vat, x.entity.correspondenceAddress, x.officialEmail, x.mol, x.entityId,
      x.laboratory.name, x.laboratory.deliveryAddress, x.laboratory.accreditationNo, x.laboratoryId, x.contactUserId, x.replaced.labName, x.replaced.deliveryAddress, x.reason]),
    // …and the round's entities, laboratories and users as they are today — the contacts among them (4.5, 4.8)
    ...roundEntities.flatMap((e) => [e.name, e.eik, e.vat, e.correspondenceAddress, e.officialEmail, e.mol, e.viesName, e.id]),
    ...roundLabs.flatMap((l) => [l.name, l.deliveryAddress, l.accreditationNo, l.id]),
    ...roundUsers.flatMap((u) => [u.name, u.email, u.phone, u.id]),
    ...labFileNames,
  ]);

  // the record of openings, read last — the export's own openings among them (4.8 review)
  const openings = want === "all" ? await listOpenings(schemeId, coded.map((p) => p.id)) : [];

  const entries: ZipEntry[] = [];
  const missing: string[] = [];
  const wantIdentity = want === "all";
  // coded/ text is scrubbed on the way in; identity/ is written as it is
  const add = (name: string, data: Uint8Array | string) => {
    if (name.startsWith("identity/") && !wantIdentity) return;
    entries.push({ name, data: typeof data === "string" && name.startsWith("coded/") ? scrub(data) : data });
  };
  const addCoded = (name: string, rows: object[], first: string[]) => add(name, table(scrubDeep(rows, scrub), first));

  // coded/ ───────────────────────────────────────────────────────────────────
  add("coded/scheme.json", JSON.stringify(scrubDeep(codedScheme(s), scrub), null, 2));
  addCoded("coded/codes.csv", participants.map((p) => ({ ...pick(p, CODED_P), standing: codedStanding(p.standing) })), [...CODED_P, "standing"]);
  addCoded("coded/results.csv",
    Object.entries(s.scoring?.results ?? {}).flatMap(([code, byMetric]) => Object.entries(byMetric).map(([metric, r]) => ({ code, metric, ...r }))),
    ["code", "metric", "value", "u", "determinations"]);
  addCoded("coded/assigned.csv", Object.entries(s.scoring?.assigned ?? {}).map(([metric, a]) => ({ metric, ...a })), ["metric", "xpt", "sigma", "u"]);
  // the scheme's own records as tables (3.14) — readable without the JSON: its life,
  // its amendments and extensions, its batches and their values, its characteristics
  // and their versions, the design data for 2.0, the lists, the prices. Codes only.
  for (const [file, rows, cols] of schemeTables(s)) addCoded(file, rows, cols);
  // …and the round's own records (5.2–5.10, part 5.12) — by the codes as they are now
  const codeById = new Map(participants.map((p) => [p.id, p.code] as const));
  for (const [file, rows, cols] of roundTables(s, (pid) => codeById.get(pid) ?? "—")) addCoded(file, rows, cols);
  // the submitted versions of the results (6.1–6.4) — by code; the data as submitted; the account
  // that submitted is a person's: identity/submissions_by.csv
  addCoded("coded/submissions.csv", submitted.map((x) => ({ code: codeById.get(x.participantId) ?? "—", version: x.version, submittedAt: x.submittedAt, roundAt: x.roundAt ?? "", configVersion: x.configVersion ?? "", data: JSON.stringify(codedSubmissionData(x.data)) })), ["code", "version", "submittedAt", "roundAt", "configVersion", "data"]);
  // the corrections (6.5) — the reported value and the used one, the reason, by whom: by code
  addCoded("coded/result_corrections.csv", corrected.map((c) => ({ code: codeById.get(c.participantId) ?? "—", version: c.version, key: c.key, field: c.field, reported: c.reported, used: c.used ?? "", withdrawn: c.used === null ? "yes" : "", reason: c.reason, at: c.at, by: c.by })), ["code", "version", "key", "field", "reported", "used", "withdrawn", "reason", "at", "by"]);
  // old stamps carry a lab's e-mail and file name: redacted as for staff (N4)
  addCoded("coded/case_events.csv", events.map((e: CaseEvent) => { const r = redactCaseEventForStaff(e); return { ...r, recordedBy: r.recordedBy.startsWith("lab:") ? "laboratory" : r.recordedBy, schemeId: undefined }; }),
    ["id", "code", "kind", "at", "ref", "note", "recordedBy", "recordedAt", "source", "docKey", "voidedAt", "voidedBy", "voidReason"]);
  // readBefore46: the first read by anyone, as it was kept before 4.6 — since, a read is
  // each person's (the bell's state, not round data)
  addCoded("coded/notices.csv", notices.map((n: Notification) => ({ ...n, readBefore46: n.readAt, labId: undefined, schemeId: undefined })),
    ["id", "createdAt", "kind", "audience", "code", "bg", "en", "href", "readBefore46", "emailedAt", "releasedAt", "releasedBy", "withheldAt", "withheldBy"]);
  addCoded("coded/messages.csv", messages.map((m: SentMessage) => ({ ...m, to: undefined, labId: undefined, entityId: undefined, schemeId: undefined })),
    ["id", "sentAt", "class", "kind", "code", "subject", "body", "approvedBy", "approvalRef", "outcome", "error"]);
  addCoded("coded/scheme_roles.csv", (await listSchemeRoles({ schemeId, all: true })).map((r) => ({ ...r, schemeId: undefined })),
    ["id", "role", "personEmail", "orderRef", "assignedBy", "assignedAt", "endedAt", "endedBy"]);
  addCoded("coded/processing_roles.csv", (await listDesignations({ schemeId, all: true })).map((d) => ({ ...d, schemeId: undefined })),
    ["id", "processor", "reviewer", "approver", "reviewerBasis", "coincide", "justification", "setBy", "setAt", "endedAt", "endedBy"]);
  addCoded("coded/journal.csv", journal.map((e: ActivityEvent) => ({ ...redactActivityForStaff(e), schemeId: undefined })),
    ["id", "at", "actorName", "actorEmail", "actorRole", "action", "targetCode", "subject", "summary", "before", "after"]);

  // saved versions of the documents: a body that names laboratories → identity/
  const revRows: { part: Part; row: Record<string, unknown> }[] = [];
  for (const r of revisions as DocRevision[]) {
    const part: Part = bodyHasNames(r.docKey, r) ? "identity" : "coded";
    const files: Record<string, string> = {};
    for (const lang of ["bg", "en"] as const) {
      if (!r[lang]) continue;
      const f = `${part}/files/revisions/${safe(r.docKey)}-v${r.version}-${lang}.html`;
      add(f, r[lang]);
      files[lang] = f;
    }
    revRows.push({ part, row: { id: r.id, docKey: r.docKey, version: r.version, savedBy: r.savedBy, savedAt: r.savedAt, approved: r.approved, approvedBy: r.approvedBy, approvedAt: r.approvedAt, note: r.note, fileBg: files.bg, fileEn: files.en } });
  }
  addCoded("coded/doc_revisions.csv", revRows.filter((x) => x.part === "coded").map((x) => x.row), ["id", "docKey", "version", "savedBy", "savedAt", "approved", "approvedBy", "approvedAt", "note", "fileBg", "fileEn"]);

  // every edition of the documents (3.0), each with its frozen file — the ones the
  // participants hold marked. None names a laboratory (the lists and the certificate
  // have no editions; a frozen file is rendered as the participants receive it).
  const eds: Record<string, unknown>[] = [];
  for (const e of await listEditions(schemeId)) {
    const base = `coded/files/editions/${safe(e.docKey)}/${e.no}`;
    const row = { id: e.id, docKey: e.docKey, no: e.no, issuedOn: e.issuedOn, issuedAt: e.issuedAt, issuedBy: e.issuedBy, reason: e.reason, scope: e.scope, source: e.source,
      withParticipants: s.sentToParticipants?.[e.docKey] && s.releasedEditions?.[e.docKey]?.id === e.id ? "yes" : "" };
    // the frozen files go in byte for byte — never through the scrubber, or they would
    // stop being the files their hashes name; each is checked against its hash here
    if (e.source === "uploaded") {
      const b = e.file ? await fileBytes(e.file) : null;
      const f = `${base}.${ext(e.file?.mime ?? "")}`;
      if (b) add(f, b); else missing.push(f);
      eds.push({ ...row, lang: "", file: b ? f : "", sha256: e.sha.file, altered: b && sha256(b) !== e.sha.file ? "yes" : "", missing: b ? "" : "yes" });
    } else {
      for (const lang of ["bg", "en"] as const) {
        const ref = e[lang];
        const b = ref ? await htmlBytes(ref) : null;
        const f = `${base}-${lang}.html`;
        if (!b) { missing.push(f); eds.push({ ...row, lang, file: "", sha256: e.sha[lang], missing: "yes" }); continue; }
        const altered = sha256(b) !== e.sha[lang] ? "yes" : "";
        const text = Buffer.from(b).toString("utf8");
        if (scrub(text) !== text) {
          // an edition that names a laboratory of the round (none should — it is
          // rendered as the participants receive it): kept out of coded/, whole in
          // identity/, and said so
          if (wantIdentity) add(`identity/files/editions/${safe(e.docKey)}/${e.no}-${lang}.html`, b);
          eds.push({ ...row, lang, file: "", sha256: e.sha[lang], altered, withheld: "names a laboratory — in identity/" });
        } else {
          add(f, b);
          eds.push({ ...row, lang, file: f, sha256: e.sha[lang], altered });
        }
      }
    }
  }
  addCoded("coded/editions.csv", eds, ["id", "docKey", "no", "issuedOn", "issuedAt", "issuedBy", "reason", "scope", "source", "withParticipants", "lang", "file", "sha256", "altered", "missing", "withheld"]);

  // the scheme's own uploaded documents: coded/ unless the document names laboratories
  const uploads: Record<string, unknown>[] = [];
  for (const [doc, up] of Object.entries(s.uploads ?? {})) {
    const part: Part = namesDoc(doc) ? "identity" : "coded";
    if (part === "identity" && !wantIdentity) continue;
    const f = `${part}/files/uploads/${safe(doc)}.${ext(up.mime)}`;
    const b = await fileBytes(up);
    if (b) add(f, b); else missing.push(f);
    uploads.push({ docKey: doc, part, mime: up.mime, size: up.size, uploadedAt: up.uploadedAt, file: b ? f : "" });
  }
  addCoded("coded/uploads.csv", uploads, ["docKey", "part", "mime", "size", "uploadedAt", "file"]);

  // every document as a printable page — for going on on paper. coded/: as the
  // participants would get it (no names); identity/: the lists and certificates, named
  const skin = await resolveSkinAsync(s);
  const docsOut: Record<string, unknown>[] = [];
  for (const def of DOCUMENTS) {
    if (!def.render) continue;
    for (const lang of ["bg", "en"] as Lang[]) {
      if (!namesDoc(def.key)) {
        const html = await renderCohortDoc(s, def.key, lang);
        if (!html) continue;
        const f = `coded/files/documents/${safe(def.key)}-${lang}.html`;
        add(f, html);
        docsOut.push({ docKey: def.key, formNumber: def.formNumber, lang, part: "coded", file: f });
      } else if (wantIdentity && def.key !== "certificate") {
        const opts = { revealNames: true, participants };
        const body = savedDocBody(s, def.key)?.[lang] || docDefaultBody(s, def.key, lang, opts);
        const f = `identity/files/documents/${safe(def.key)}-${lang}.html`;
        add(f, docPrintHtml(s, def.key, lang, body, opts, skin));
        docsOut.push({ docKey: def.key, formNumber: def.formNumber, lang, part: "identity", file: f });
      } else if (wantIdentity) {
        for (const p of participants) {
          const cert = s.certificates?.[p.code];
          if (!cert) continue;
          const opts = { participant: { code: p.code, labName: p.labName, certNo: cert.no, certDate: cert.date } };
          const f = `identity/files/documents/certificate-${safe(p.code)}-${lang}.html`;
          add(f, docPrintHtml(s, "certificate", lang, docDefaultBody(s, "certificate", lang, opts), opts, skin));
          docsOut.push({ docKey: "certificate", code: p.code, formNumber: def.formNumber, lang, part: "identity", file: f });
        }
      }
    }
  }
  addCoded("coded/documents.csv", docsOut.filter((d) => d.part === "coded"), ["docKey", "formNumber", "lang", "part", "file"]);

  // the images the documents show
  const imgText = [s.coverImage ?? "", JSON.stringify(s.docs ?? {}), JSON.stringify(s.composed ?? {}), ...revisions.flatMap((r) => [r.bg, r.en])].join("\n");
  const images: Record<string, unknown>[] = [];
  for (const path of new Set([...imgText.matchAll(IMG)].map((m) => decodeURIComponent(m[1])))) {
    const b = await storageBytes("skin-assets", path);
    const f = `coded/files/images/${safe(path)}`;
    if (b) add(f, b); else missing.push(f);
    images.push({ storagePath: path, file: b ? f : "" });
  }
  addCoded("coded/images.csv", images, ["storagePath", "file"]);

  // identity/ ────────────────────────────────────────────────────────────────
  if (wantIdentity) {
    add("identity/participants.csv", table(participants.map((p) => ({ ...p })), ["code", "labName", "contact", "email", "phone", "country", "deliveryAddress", "labId", "standing"]));
    const codeOf = new Map(coded.map((p) => [p.id, p.code]));
    const codesOf = (o: (typeof openings)[number]) => [...new Set([o.participantId, ...(o.participantIds ?? [])].filter(Boolean).map((id) => codeOf.get(id!)).filter(Boolean))].join(" ");
    add("identity/identity_openings.csv", table(openings.map((o) => ({ ...o, codes: codesOf(o) })), ["at", "actor", "purpose", "codes", "labId", "rows", "dbUser", "loginUser"]));
    add("identity/labs.csv", table(labs.map((l) => ({ ...l })), ["id", "name", "email", "contactPerson", "phone", "registeredAddress", "eik", "vat", "mol", "accreditationCert", "status"]));
    const codeById = new Map(coded.map((p) => [p.id, p.code]));
    // the round's legal entities, laboratories and users as they are today (4.8) — never a
    // sign-in account's id
    // (VIES's registered name is read only to be scrubbed from coded/ — not a column here)
    add("identity/entities.csv", table(roundEntities.map(({ viesName: _vies, ...e }) => { void _vies; return e; }),
      ["id", "name", "country", "eik", "vat", "correspondenceAddress", "officialEmail", "mol", "language", "state", "origin", "confirmedAt", "erasedAt", "viesStatus", "manualCheckAt"]));
    add("identity/laboratories.csv", table(roundLabs.map((l) => ({ ...l })), ["id", "entityId", "name", "deliveryAddress", "mobileOffice", "accreditationNo", "accreditationBody", "state"]));
    add("identity/entity_users.csv", table(roundUsers.map((u) => ({ ...u })),
      ["id", "entityId", "name", "position", "email", "phone", "role", "state", "receivesNotices", "twoFactorRequired"]));
    // every version of each participation's copy, every field it froze (4.5)
    add("identity/participation_snapshots.csv", table(snapshots.map((x) => ({
      code: codeById.get(x.participantId) ?? "", version: x.version, supersedes: x.supersedes ?? "", reason: x.reason, takenAt: x.takenAt, takenBy: x.takenBy, entityId: x.entityId,
      entityName: x.entity.name, entityCountry: x.entity.country, entityEik: x.entity.eik, entityVat: x.entity.vat, entityAddress: x.entity.correspondenceAddress,
      entityLanguage: x.entity.language, entityState: x.entity.state, entityOrigin: x.entity.origin, entityConfirmedAt: x.entity.confirmedAt ?? "",
      mol: x.mol, officialEmail: x.officialEmail, anonymisedAt: x.anonymisedAt ?? "",
      laboratoryId: x.laboratoryId, laboratoryName: x.laboratory.name, laboratoryDeliveryAddress: x.laboratory.deliveryAddress,
      laboratoryMobileOffice: x.laboratory.mobileOffice, laboratoryAccreditationNo: x.laboratory.accreditationNo, laboratoryAccreditationBody: x.laboratory.accreditationBody, contactUserId: x.contactUserId ?? "",
      replacedLabName: x.replaced.labName, replacedDeliveryAddress: x.replaced.deliveryAddress,
    })), ["code", "version", "supersedes", "reason", "takenAt", "takenBy", "entityId", "entityName", "entityCountry", "entityEik", "entityVat", "entityAddress",
      "entityLanguage", "entityState", "entityOrigin", "entityConfirmedAt", "mol", "officialEmail", "anonymisedAt",
      "laboratoryId", "laboratoryName", "laboratoryDeliveryAddress", "laboratoryMobileOffice", "laboratoryAccreditationNo", "laboratoryAccreditationBody", "contactUserId", "replacedLabName", "replacedDeliveryAddress"]));
    add("identity/scheme-identity.json", JSON.stringify(identityScheme(s), null, 2));
    add("identity/certificates.csv", table(Object.entries(s.certificates ?? {}).map(([code, c]) => ({ code, ...c })), ["code", "no", "date", "registeredBy", "registeredAt"]));
    add("identity/applications.csv", table((s.applications ?? []).map((a) => ({ ...a })), ["id", "submittedAt", "status", "labName", "companyName", "contactPerson", "email", "phone"]));
    // a notice's laboratory: its earlier account, or (4.6) the entity of its participation's copy
    const entityOfCode = new Map([...inForce(snapshots).values()].map((x) => [codeById.get(x.participantId) ?? "", x.entityId]));
    // who submitted each version of the results (6.4) — an account: a laboratory's or a user's
    // …with a calibration form's laboratory name and who filled it (rule 3 allows them on the lab's own form)
    add("identity/submissions_by.csv", table(submitted.map((x) => ({ code: codeById.get(x.participantId) ?? "—", version: x.version, submittedBy: x.submittedBy, ...submissionIdentity(x.data) })), ["code", "version", "submittedBy", "labName", "signedBy", "subcontractedPart"]));
    add("identity/notice_recipients.csv", table(notices.filter((n) => n.labId || (n.code && entityOfCode.get(n.code))).map((n) => ({ id: n.id, code: n.code, labId: n.labId, entityId: n.code ? entityOfCode.get(n.code) ?? "" : "" })), ["id", "code", "labId", "entityId"]));
    add("identity/message_recipients.csv", table(messages.map((m) => ({ id: m.id, code: m.code, labId: m.labId, entityId: m.entityId, to: m.to, error: m.error })), ["id", "code", "labId", "entityId", "to", "error"]));
    add("identity/journal_full.csv", table(journal, ["id", "at", "actorId", "actorName", "actorEmail", "actorRole", "action", "targetCode", "subject", "summary", "before", "after"]));
    add("identity/case_events_full.csv", table(events, ["id", "code", "kind", "at", "ref", "note", "recordedBy", "recordedAt", "source"]));
    add("identity/doc_revisions_named.csv", table(revRows.filter((x) => x.part === "identity").map((x) => x.row), ["id", "docKey", "version", "savedBy", "savedAt", "approved", "fileBg", "fileEn"]));
    add("identity/documents.csv", table(docsOut.filter((d) => d.part === "identity"), ["docKey", "code", "formNumber", "lang", "file"]));
    // the laboratories' own files and the documents addressed to one laboratory
    const labFiles: Record<string, unknown>[] = [];
    const putLab = async (kind: "lab-uploads" | "lab-docs", code: string, slot: string, up: UploadedDoc) => {
      const f = `identity/files/${kind}/${safe(code)}-${safe(slot)}.${ext(up.mime)}`;
      const b = await fileBytes(up);
      if (b) add(f, b); else missing.push(f);
      labFiles.push({ kind, code, slot, name: up.name, mime: up.mime, size: up.size, uploadedAt: up.uploadedAt, uploadedBy: up.uploadedBy, file: b ? f : "" });
    };
    for (const [code, slots] of Object.entries(s.labUploads ?? {})) for (const [slot, up] of Object.entries(slots ?? {})) if (up) await putLab("lab-uploads", code, slot, up);
    for (const [code, slots] of Object.entries(s.labDocs ?? {})) for (const [slot, up] of Object.entries(slots ?? {})) if (up) await putLab("lab-docs", code, slot, up);
    add("identity/lab_files.csv", table(labFiles, ["kind", "code", "slot", "name", "mime", "size", "uploadedAt", "uploadedBy", "file"]));
    // what was replaced or removed — kept, never deleted (part 0.9)
    const old: Record<string, unknown>[] = [];
    let i = 0;
    for (const x of s.supersededFiles ?? [] as SupersededFile[]) {
      i++;
      const f = `identity/files/superseded/${String(i).padStart(3, "0")}-${safe(x.where)}.${ext(x.file.mime)}`;
      const b = await fileBytes(x.file);
      if (b) add(f, b); else missing.push(f);
      old.push({ where: x.where, at: x.at, reason: x.reason, by: x.by, name: x.file.name, mime: x.file.mime, size: x.file.size, file: b ? f : "" });
    }
    add("identity/superseded_files.csv", table(old, ["where", "at", "reason", "by", "name", "mime", "size", "file"]));
  }

  add("README.md", readme(s, want, now, entries.map((e) => e.name), missing, scrub.hits()));
  return { zip: zip(entries, now), files: entries.map((e) => e.name), missing, scheme: s };
}

function readme(s: Scheme, want: "all" | "coded", now: Date, files: string[], missing: string[], hidden = 0): string {
  const list = (prefix: string) => files.filter((f) => f.startsWith(prefix) && !f.includes("/files/")).map((f) => `- \`${f}\``).join("\n");
  return `# ${s.number} — целият кръг · the whole round

Формат / format: \`${EXPORT_FORMAT}\` · направено / made: ${now.toISOString()} · ${want === "all" ? "и двете части / both parts" : "само кодираната част / the coded part only"}${missing.length ? " · **НЕПЪЛЕН — виж «Липсващи файлове» · INCOMPLETE — see «Missing files»**" : ""}

Всичко за един кръг (Реш. 136), за да може кръгът да продължи и без портала. Everything of one round (Decision 136), so it can go on without the portal.

## Как се чете · How to read it

- **Таблиците** са CSV в UTF-8, със запетая и точка за десетичните. В Excel с български настройки: «Данни → От текст/CSV», кодиране UTF-8, разделител запетая; иначе числото 10.2 може да стане дата. Клетка, която започва с апостроф, е текст, не формула. · **Tables** are CSV, UTF-8, comma-separated, «.» as the decimal point. In Excel: Data → From Text/CSV, UTF-8, comma. A cell starting with an apostrophe is text, not a formula.
- **Ключът е кодът на участника** (\`code\`). В кодираната част той е единственият идентификатор; в identity/ \`participants.csv\` казва кой стои зад него. · **The key is the participant code** (\`code\`); identity/participants.csv says who is behind it.
- **Юридическите лица, лабораториите и потребителите** (identity/): \`participation_snapshots.csv\` — копието към всяко участие, както е било тогава; \`entities.csv\` (ключ \`id\`), \`laboratories.csv\`, \`entity_users.csv\` — юридическите лица на участията в кръга с **всичките** им лаборатории и потребители (и неактивните, и тези извън кръга), както са в деня на изнасянето. Копието сочи към тях с \`entityId\`, \`laboratoryId\`, \`contactUserId\`. · **Legal entities, laboratories, users** (identity/): participation_snapshots.csv — each participation's copy as it was then; entities.csv (key id), laboratories.csv, entity_users.csv — the round's participations' legal entities with ALL their laboratories and users (inactive ones and ones outside this round too), as they are on the day of the export; the copy points to them by entityId, laboratoryId, contactUserId.
- **Метрика** (\`metric\` в results.csv / assigned.csv): при изпитване — номерът на характеристиката в \`scheme.json → parameters\` (от 0); при калибриране — \`посока:точка\`. · **metric**: testing — the index into scheme.json → parameters (from 0); calibration — \`direction:point\`.
- \`coded/files/documents/\` — всеки документ като страница за печат (без имена); \`coded/files/editions/\` — всяка редакция на документите, замразена (\`editions.csv\`: номер, дата, причина, обхват, SHA-256, коя е при участниците). · every document as a printable page (no names); every edition of the documents, frozen (editions.csv: number, date, reason, scope, SHA-256, which one the participants hold).
- Текстовете на запазените версии от редактора са файлове в \`files/revisions/\`; таблицата сочи към тях (това не са редакциите — те са в \`files/editions/\`). · The editor's saved versions are files; the table points to them (not the editions — those are in files/editions/).

## coded/ — по код · by participant code

Без име, адрес, телефон, акаунт, име на файл или номер на сертификат на лаборатория — всяка такава стойност от кръга (от 4 знака нагоре, като цяла дума; числата — от 8 цифри нагоре) е заменена с «${HIDDEN}», ако се е появила в свободен текст. Заменени: ${hidden}. Само собствено име, без фамилия, може да остане — свободният текст не бива да назовава хора. Може да се даде сама на експерта по статистика. · No laboratory name, address, phone, account, file name or certificate number — any such value of this round (4 characters or more, as a whole word; numbers of 8 digits or more) in free text is replaced by «${HIDDEN}». Replaced: ${hidden}. A first name alone may remain — free text should name no one. It may be given alone to the statistics expert.

${list("coded/")}

## identity/ — кой стои зад кода · who is behind each code

Само за ръководителя на схемата и експерта по кодиране (Реш. 93). · For the scheme manager and the coding expert only (Decision 93).

${want === "all" ? list("identity/") + `
- \`identity/files/\` — списъците и сертификатите с имената, файловете на лабораториите, документите до една лаборатория, заменените файлове · the named lists and certificates, the laboratories' files, documents addressed to one laboratory, replaced files` : "_Не е включена в този файл · not in this file._"}

## Какво не е тук · What is not included

- Сметките на лабораториите за други кръгове и заявките за акаунт · laboratory accounts' other rounds, and account requests (lab_applications)
- Общите шаблони, библиотеката, облиците · shared templates, the library, skins (the documents here are already rendered with the round's skin)
- Самите изчисления на PTS_Analysis 2.0 — порталът не смята оценки (Реш. 135) · the PTS_Analysis 2.0 calculations — the portal computes no scores

${missing.length ? `## Липсващи файлове · Missing files\n\nЗаписани, но не намерени в хранилището · recorded, but not found in storage:\n\n${missing.map((m) => `- \`${m}\``).join("\n")}\n` : ""}`;
}

// ── the scheme's tables (plan part 3.14) ────────────────────────────────────
/** Every record the scheme keeps since Phase 3, one table each — the same data as
 *  coded/scheme.json, laid out to be read (an assessor, PTS_Analysis 2.0's sheets).
 *  Participants by their codes only; the people are PTS's staff, as in the journal. */
export function schemeTables(s: Scheme): [string, object[], string[]][] {
  const lc = s.lifecycle ?? {};
  const json = (v: unknown) => (v === undefined ? "" : JSON.stringify(v));
  const meta = schemeMeta(s);
  const lists = listsOf(s);
  return [
    // the second announcement's final list and the first's count against the minimum (5.2)
    ["coded/lifecycle_acts.csv", (lc.acts ?? []).map((a) => ({ ...a })), ["act", "from", "to", "day", "at", "by", "note", "count", "final"]],
    ["coded/lifecycle_stages.csv", Object.entries(lc.stages ?? {}).map(([no, t]) => ({ stage: no, ...t })).sort((a, b) => Number(a.stage) - Number(b.stage)), ["stage", "day", "at", "by", "note", "afterResults"]],
    ["coded/amendments.csv", (s.amendments ?? []).map((a) => ({ ...a, dates: json(a.dates), datesBefore: json(a.datesBefore), editions: json(a.editions), pending: (a.pending ?? []).join(" ") })), ["id", "no", "orderNo", "orderDate", "reason", "points", "validity", "dates", "datesBefore", "editions", "pending", "day", "at", "by"]],
    ["coded/extensions.csv", (s.extensions ?? []).map((e) => ({ ...e })), ["id", "code", "key", "stopId", "until", "orderNo", "orderDate", "reason", "day", "at", "by"]],
    ["coded/batches.csv", (s.batches ?? []).map((b) => ({ id: b.id, label: b.label, material: b.material, preparedOn: b.preparedOn, storage: b.storage, prefix: b.prefix, objects: b.objects.length, hsRecord: b.hsRecord ?? "", createdAt: b.createdAt, createdBy: b.createdBy, drawDay: b.draw?.day ?? "", drawAt: b.draw?.at ?? "", drawBy: b.draw?.by ?? "", drawCounts: json(b.draw?.counts) })), ["id", "label", "material", "preparedOn", "storage", "prefix", "objects", "hsRecord", "createdAt", "createdBy", "drawDay", "drawAt", "drawBy", "drawCounts"]],
    ["coded/batch_objects.csv", (s.batches ?? []).flatMap((b) => b.objects.map((o) => ({ batch: b.label, code: o.code, role: o.role ?? "" }))), ["batch", "code", "role"]],
    // every value on record — `current` says which count (a later one of the same key
    // corrects it); `place` counts from 1, as characteristics.csv does (3.14 review)
    ["coded/homogeneity.csv", (s.batches ?? []).flatMap((b) => { const cur = new Set(currentHomogeneity(b.homogeneity)); return (b.homogeneity ?? []).map((h) => ({ batch: b.label, series: h.series, sampleCode: h.sampleCode, characteristicId: h.characteristicId ?? "", place: h.characteristic === null ? "" : h.characteristic + 1, characteristicName: h.characteristicName, replicate: h.replicate, value: h.value, current: cur.has(h) ? "yes" : "no", at: h.at ?? "", by: h.by ?? "" })); }), ["batch", "series", "sampleCode", "characteristicId", "place", "characteristicName", "replicate", "value", "current", "at", "by"]],
    ["coded/characteristics.csv", s.parameters.map((p, i) => ({ place: i + 1, id: p.id ?? "", nameBg: p.characteristicBg, nameEn: p.characteristicEn, methodBg: p.standardBg, methodEn: p.standardEn, unit: p.unit ?? "", step: p.step ?? "", guardMin: p.guardMin ?? "", guardMax: p.guardMax ?? "", uRequired: p.uRequired ? "yes" : "", group: p.group ?? "", groupEn: p.groupEn ?? "", determinations: p.determinations ?? "", engine: json(p.engine) })), ["place", "id", "nameBg", "nameEn", "methodBg", "methodEn", "unit", "step", "guardMin", "guardMax", "uRequired", "group", "groupEn", "determinations", "engine"]],
    ["coded/characteristic_versions.csv", (s.characteristicVersions ?? []).map((v) => ({ no: v.no, day: v.day, at: v.at, by: v.by, characteristics: v.characteristics.length, ids: v.characteristics.map((c) => c.id ?? "").join(" "), points: (v.points?.ids ?? []).join(" ") })), ["no", "day", "at", "by", "characteristics", "ids", "points"]],
    ["coded/scheme_meta.csv", Object.entries(meta).map(([key, value]) => ({ key, value })), ["key", "value"]],
    // the contract's sheet: the list, or the providers the plan's point 3 names (review)
    ["coded/external_providers.csv", providerRows(s), ["name", "address", "services", "servicesEn"]],
    ["coded/scheme_lists.csv", [...(lists.shipmentDocs ?? []).map((i) => ({ list: "shipment", ...i })), ...(lists.receiptChecks ?? []).map((i) => ({ list: "receipt", ...i })), ...(lists.accreditationRequired ? [{ list: "accreditationRequired", id: "", bg: "да", en: "yes" }] : [])], ["list", "id", "bg", "en"]],
    // money in euros with its unit — never bare cents (review)
    ["coded/commercial.csv", Object.entries({ ...(s.commercial ?? {}), minParticipants: s.minParticipants }).map(([key, value]) => (["base", "step", "addOnMtCyIe"].includes(key) ? { key, value: (Number(value) / 100).toFixed(2), unit: "EUR" } : key === "sharePct" ? { key, value: String(value), unit: "%" } : { key, value: String(value), unit: "" })), ["key", "value", "unit"]],
  ];
}

// ── the round's tables (plan part 5.12) ─────────────────────────────────────
/** Phase 5's records, one table each — the same data as coded/scheme.json, split the same way,
 *  laid out to be read: a participation by its CODE as it is now (codes.csv holds id ↔ code),
 *  never a name, an account, a carrier, a receiver, remarks or a person's words. */
export function roundTables(s: Scheme, codeOf: (participantId: string) => string): [string, object[], string[]][] {
  const coding = s.coding ?? [];
  const deliveries = Object.entries(s.deliveries ?? {});
  const points = new Map(pointKeys(s.calibration).map((k) => [k.key, k] as const));
  const billed = [...new Set([...Object.keys(s.labDocs ?? {}).filter((c) => s.labDocs?.[c]?.proforma || s.labDocs?.[c]?.invoice), ...Object.keys(s.paidAt ?? {})])].sort();
  return [
    // the coding act (5.3): each act, and each reference → its code and objects
    ["coded/coding_acts.csv", coding.map((c) => ({ id: c.id, day: c.day, at: c.at, by: c.by, count: Object.keys(c.codes).length })), ["id", "day", "at", "by", "count"]],
    ["coded/coding_map.csv", coding.flatMap((c) => Object.entries(c.codes).map(([ref, code]) => ({ act: c.id, ref, code, objects: (c.objects?.[code] ?? []).join(" ") }))), ["act", "ref", "code", "objects"]],
    // releases to one participation or one user (5.4) — the user is a person: identity/ only
    ["coded/releases.csv", (s.releases ?? []).map((r) => ({ id: r.id, docKey: r.docKey, level: r.level, code: r.level === "participation" && r.participantId ? codeOf(r.participantId) : "", editionNo: r.editionNo, at: r.at, by: r.by, withdrawnAt: r.withdrawnAt ?? "", withdrawnBy: r.withdrawnBy ?? "" })), ["id", "docKey", "level", "code", "editionNo", "at", "by", "withdrawnAt", "withdrawnBy"]],
    // delivery and receipt (5.6; the calibration device's protocol at its chain stop, 5.11)
    ["coded/shipments.csv", deliveries.flatMap(([pid, d]) => (d.shipments ?? []).map((x) => ({ code: codeOf(pid), id: x.id, kind: x.kind, day: x.day, at: x.at, by: x.by, waybill: x.waybill ?? "", docs: (x.docs ?? []).join(" "), handoverTime: x.handover?.time ?? "" }))), ["code", "id", "kind", "day", "at", "by", "waybill", "docs", "handoverTime"]],
    // of: a shipment (shipments.csv) or a calibration chain stop (chain_stops.csv) — by its id (review)
    ["coded/receipts.csv", deliveries.flatMap(([pid, d]) => (d.receipts ?? []).map((r) => ({ code: codeOf(pid), id: r.id, ofKind: r.shipmentId.startsWith("chain:") ? "chain stop" : "shipment", ofId: r.shipmentId.startsWith("chain:") ? r.shipmentId.slice(6) : r.shipmentId, day: r.day, time: r.time, undamaged: r.undamaged ? "yes" : "no", suitable: r.suitable ? "yes" : "no", failed: Object.entries(r.checks ?? {}).filter(([, v]) => !v).map(([k]) => k).join(" "), at: r.at }))), ["code", "id", "ofKind", "ofId", "day", "time", "undamaged", "suitable", "failed", "at"]],
    ["coded/delivery_problems.csv", deliveries.flatMap(([pid, d]) => (d.problems ?? []).map((x) => ({ code: codeOf(pid), id: x.id, at: x.at, resolvedAt: x.resolved?.at ?? "" }))), ["code", "id", "at", "resolvedAt"]],
    // the reference laboratory's values per point (5.7) — every version, as saved
    ["coded/reference_values.csv", (s.referenceValues?.versions ?? []).flatMap((v, i) => Object.entries(v.rows).map(([key, r]) => ({ version: i + 1, at: v.at, by: v.by, point: key, nominal: points.get(key)?.nominal ?? "", directionBg: points.get(key)?.direction?.bg ?? "", directionEn: points.get(key)?.direction?.en ?? "", xBefore: r.xBefore ?? "", xAfter: r.xAfter ?? "", uCal: r.uCal ?? "", uOther: r.uOther ?? "", k: r.k ?? "", kReason: v.kReason ?? "" }))), ["version", "at", "by", "point", "nominal", "directionBg", "directionEn", "xBefore", "xAfter", "uCal", "uOther", "k", "kReason"]],
    // the documents' numbers and the payment (5.8) — by code; the legal entity is the billing export's
    // (identity). When each was UPLOADED — the document's own date is in the document (review)
    ["coded/billing.csv", billed.map((code) => { const d = s.labDocs?.[code]; return { code, proformaNo: d?.proforma?.number ?? "", proformaUploadedAt: d?.proforma?.uploadedAt ?? "", paidAt: s.paidAt?.[code] ?? "", invoiceNo: d?.invoice?.number ?? "", invoiceUploadedAt: d?.invoice?.uploadedAt ?? "" }; }), ["code", "proformaNo", "proformaUploadedAt", "paidAt", "invoiceNo", "invoiceUploadedAt"]],
    // the calibration chain (3.x, 5.7): each stop in order — the code, when the device came and went,
    // who stamped it (the laboratory, or PTS with its source); a PTS note is a person's words: identity/
    ["coded/chain_stops.csv", (s.chain?.stops ?? []).map((x, i) => ({ order: i + 1, id: x.id, kind: x.kind, code: x.code ?? "", receivedAt: x.receivedAt ?? "", receivedBy: x.received?.by ?? "", receivedSource: x.received?.source ?? "", receivedRecordedBy: x.received?.recordedBy ?? "", sentAt: x.sentAt ?? "", sentBy: x.sent?.by ?? "", sentSource: x.sent?.source ?? "", sentRecordedBy: x.sent?.recordedBy ?? "", windowDue: x.windowDue ?? "" })), ["order", "id", "kind", "code", "receivedAt", "receivedBy", "receivedSource", "receivedRecordedBy", "sentAt", "sentBy", "sentSource", "sentRecordedBy", "windowDue"]],
    // which documents ask for an acknowledgement (5.9) — kept only while set: the export of the moment holds it (review)
    ["coded/ack_required.csv", Object.entries(s.ackRequired ?? {}).map(([docKey, v]) => ({ docKey, at: v.at, by: v.by })), ["docKey", "at", "by"]],
    // the round's settings that are not the scheme's design: the replacement's minimum days (А16,
    // 5.6), the chain's window and estimate, its dispatch and return
    ["coded/round_settings.csv", [
      ...(s.deliveryMinDays !== undefined ? [{ key: "deliveryMinDays", value: String(s.deliveryMinDays) }] : []),
      ...(s.chain?.windowWorkDays !== undefined ? [{ key: "chainWindowWorkDays", value: String(s.chain.windowWorkDays) }] : []),
      ...(s.chain?.daysPerLab !== undefined ? [{ key: "chainDaysPerLab", value: String(s.chain.daysPerLab) }] : []),
      ...(s.chain?.dispatchedAt ? [{ key: "chainDispatchedAt", value: s.chain.dispatchedAt }] : []),
      ...(s.chain?.returnedAt ? [{ key: "chainReturnedAt", value: s.chain.returnedAt }] : []),
    ], ["key", "value"]],
    // the acknowledgements and the declaration's ticks (5.9) — the account is an entity user's: identity/ only
    ["coded/acknowledgements.csv", (s.acknowledgements ?? []).map((a) => ({ code: codeOf(a.participantId), docKey: a.docKey, kind: a.kind, editionNo: a.editionNo ?? "", sha256: a.sha ?? "", lang: a.lang ?? "", at: a.at })), ["code", "docKey", "kind", "editionNo", "sha256", "lang", "at"]],
    // the one-way messages PTS sent (5.10) — the text a person wrote: identity/ only
    ["coded/scheme_messages.csv", (s.messages ?? []).map((m) => ({ id: m.id, at: m.at, by: m.by, to: m.to.kind === "all" ? "all" : codeOf(m.to.participantId), count: m.to.kind === "all" ? m.to.count : 1, missed: m.to.kind === "all" ? (m.to.missed ?? []).map(codeOf).join(" ") : "" })), ["id", "at", "by", "to", "count", "missed"]],
  ];
}
