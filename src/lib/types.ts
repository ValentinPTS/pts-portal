// The Scheme is the single source of truth. Every document is generated from it,
// so a value (number, date, standard, name) is entered once and is identical
// across all documents and both languages — eliminating the copy-paste drift
// found in the real files (see ../../PROJECT-ANATOMY.md).

import type { SchemeKind, Activity } from "./scheme-number";
import type { Lifecycle } from "./lifecycle-model";
import type { CodingRecord } from "./coding-model";
import type { TargetRelease } from "./release-model";
import type { Amendment } from "./amendments-model";
import type { Extension } from "./deadlines-model";
import type { Batch } from "./batches-model";
import type { EngineField, CharacteristicVersion } from "./characteristics-model";
import type { Commercial } from "./commercial-model";
import type { SchemeLists } from "./scheme-lists-model";
import type { ExternalProvider } from "./scheme-meta";

export type Lang = "en" | "bg";

// Optional per-render context. The route resolves participant data and passes it
// here, so the document renderers stay pure (no store/async access inside a
// renderer). `participant` = one lab (Certificate); `participants` = the full
// list (List of Registered Participants).
export interface DocOptions {
  participant?: {
    code: string; labName: string; certNo?: string; certDate?: string;
    /** 7.7: as typed from the approved report and checked — the conclusion, the results, the period, the methods (this language's) */
    content?: { conclusion: string; results: string; period: string; methods: string };
    /** 7.7: the R the content was typed from — printed («по окончателния доклад R1») */
    fromR?: number;
    /** 7.7: PTS's preview of a certificate not released (or typed from an earlier R) — marked so on it */
    preview?: "unreleased" | "stale";
    /** 7.7: what was reported — printed instead of every characteristic */
    scope?: { key: string; bg: string; en: string }[];
  };
  participants?: {
    code: string;
    labName: string;
    country: string;
    contact?: string;
    email?: string;
    phone?: string;
    deliveryAddress?: string;
    participations?: number;
    courier?: string; // F 7.2.1-4 "Вид на куриера"
    sampleCode?: string; // F 7.2.1-5/-6 "Код на пробата"
    characteristics?: number[]; // F 7.2.1-6 — indexes into Scheme.parameters this lab registered for
  }[];
  // RT1 — when false, the participant lists (F 7.2.1-4 / -6) hide real names,
  // contacts and addresses; only the code remains. Only a manager sees names
  // (§4.2 confidentiality). Defaults to true (build mode / older callers).
  revealNames?: boolean;
}

// Scheme lifecycle. "open" = visible to labs online (apply); see PROJECT-ANATOMY.md.
// The scheme's state (part 3.2, lib/lifecycle-model): preparation; open for
// applications; running after the first announcement; processing; the report issued;
// the records closed — or not held, at the first announcement (О9, Реш. 129).
export type SchemeStatus = "draft" | "open" | "running" | "processing" | "report" | "closed" | "not_held";

// A participating laboratory. Identified everywhere by its random `code`; the
// name/contact are admin-only (ISO confidentiality). Status follows the journey.
export type ParticipantStatus =
  | "applied"
  | "approved"
  | "invoiced"
  | "paid"
  | "dispatched"
  | "received"
  | "submitted"
  | "scored";

// A participation, CODED — what everyone at PTS works with (part 2.3, Н1). Who is
// behind the code is its ParticipantIdentity, kept apart in the identity store
// (lib/identity-store.ts, migration 0024) and opened only through it, on record.
export interface CodedParticipant {
  id: string;
  schemeId: string;
  code: string; // by the code rule (lib/code-rule, 3.12) — unique within the scheme, never reused
  participations: number; // how many times this lab has participated (F 7.2.1-4)
  courier?: string; // F 7.2.1-4 "Вид на куриера" — Спиди БГ / Спиди EN / Поща/Fedex
  sampleCode?: string; // F 7.2.1-5/-6 "Код на пробата" — the coded PT item sent to this lab
  // F 7.2.1-6 — which scheme characteristics (indexes into Scheme.parameters) this
  // lab registered for. Kept from the application's selections at approval; absent
  // (or empty) = all characteristics, so older participants keep rendering fully.
  characteristics?: number[];
  // the application's participations per characteristic (5.1; key: the characteristic's
  // index, value 1–10) — the objects are computed from it (lib/application-model);
  // absent on an older participation: one of each of its characteristics
  selections?: Record<string, number>;
  // out of the round (5.1): refused with a category and a reason, annulled or withdrawn
  // with its source — set once, never changed (migration 0039)
  standing?: import("./application-model").Standing;
  // when the participation was entered (the row's created_at) — read only; the order of entry
  // the billing export lists them in (5.8; Реш. 98: a second participation is billed at its share)
  createdAt?: string;
  status: ParticipantStatus;
}

// Who is behind a code — the code ↔ laboratory mapping (2.3)
export interface ParticipantIdentity {
  labName: string;
  contact: string;
  email: string;
  phone: string;
  country: string;
  deliveryAddress: string; // address the PT items are shipped to (F 7.2.1-4)
  // Phase 2b: links this participation to the lab's permanent account (lib/labs.ts).
  // Absent for older/owner-added participants until linked.
  labId?: string;
}

// a participation WITH its identity — only ever from the identity store
export type Participant = CodedParticipant & ParticipantIdentity;

// Phase 2b — a laboratory's PERMANENT account (one per lab, reused across schemes).
// Identity key = email (the login). Owns many Participations (participants rows).
export type LabStatus = "active" | "inactive";
export interface Lab {
  id: string;
  email: string; // login + identity key (stored lower-cased)
  name: string;
  accreditationCert: string;
  contactPerson: string;
  phone: string;
  registeredAddress: string;
  eik: string; // ЕИК
  vat: string; // ДДС №
  mol: string; // МОЛ
  status: LabStatus;
  authUserId?: string; // Supabase Auth user id (set when the invite is accepted)
  createdAt: string;
}

// Phase RT1 — internal staff roles & access control (ISO/IEC 17043:2023 §5, §6.2).
// A StaffUser is an internal portal user (not a lab). The role decides what they
// may see/do; only a "manager" may reveal the real name behind a participant code
// (the confidential F 7.2.1-6 mapping, §4.2). "lab" is NOT a staff role — labs
// are a separate account type (see Lab above) — but the effective role union used
// across the app (lib/roles.ts) includes it.
export type StaffRole = "manager" | "staff" | "auditor";
export type StaffStatus = "active" | "inactive";
export interface StaffUser {
  id: string;
  email: string; // login + identity key (stored lower-cased)
  name: string;
  role: StaffRole;
  status: StaffStatus;
  createdAt: string;
  // part 2.1: quality manager or software administrator (the head is named in
  // PROVIDER_HEAD_EMAILS) — lib/role-model.ts
  permanentRole?: "quality" | "software_admin";
}

// A real folder in the explorer tree. Lives under a type root (T/C); parentId null
// = directly under that root. Holds subfolders and/or schemes. Year folders (2026…)
// are ordinary folders the user creates — they persist regardless of scheme numbers.
export interface Folder {
  id: string;
  type: "T" | "C";
  name: string;
  parentId: string | null;
  createdAt: string;
}

// Phase RT5 — one saved revision of a Word-editor document (§8.3 control of
// documents). Snapshots both languages plus who saved/approved it. The highest
// version is "current"; older ones are "superseded". Append-only history.
export interface DocRevision {
  id: string;
  schemeId: string;
  docKey: string;
  version: number;
  bg: string;
  en: string;
  note?: string;
  savedBy: string;
  savedAt: string; // ISO
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string; // ISO
}

// Phase RT3 — one dated milestone in a participant's case file (§7.3.4/§7.3.5,
// §7.4, §7.5.1). Identified by participant CODE only (never a name, §4.2). Some
// events are auto-stamped by the portal; the rest are recorded manually by staff
// for the offline steps (courier dispatch + waybill, posted documents, etc.).
export type CaseEventKind =
  | "code_assigned"      // auto — participant created / application approved
  | "docs_sent"          // instructions / results sheet sent to the lab
  | "items_dispatched"   // PT items shipped (ref = waybill no.)
  | "receipt_confirmed"  // lab confirmed receipt (Protocol)
  | "results_returned"   // lab returned its results sheet
  | "scored"             // results scored
  | "report_issued"      // auto — Final Report / Certificate issued
  | "other";
export interface CaseEvent {
  id: string;
  schemeId: string;
  code: string; // the participant code — the only identifier
  kind: CaseEventKind;
  at: string; // the day it happened (yyyy-mm-dd)
  ref?: string; // waybill no. / document name / reference
  note?: string;
  recordedBy: string; // actor email (who logged it)
  recordedAt: string; // ISO timestamp it was recorded
  source: "auto" | "manual";
  // which portal document the event refers to (lib/documents.ts key, e.g.
  // "instruction") — proves WHICH document was sent/received (migration 0014)
  docKey?: string;
  // Part 0.9 (N23): never deleted — voided, with who, when and why (migration 0017)
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}

// Phase RT2 — one entry in the append-only activity log (§7.5.1 / §8.4). Records
// who did what, when. Confidentiality: `targetCode` holds a participant CODE (or an
// opaque account id) — NEVER a real name — and `summary` is written code-only.
export interface ActivityEvent {
  id: string;
  at: string; // ISO timestamp
  actorEmail: string; // who (e.g. an e-mail, or "build" while login is off)
  actorRole: string; // role at the time (manager/staff/auditor/lab/none)
  action: string; // machine key, e.g. "scheme.created", "role.changed"
  schemeId?: string; // scope, for per-scheme filtering
  targetCode?: string; // participant code / opaque id when relevant (never a name)
  summary: string; // human-readable, code-only
  // part 1.9
  actorId?: string;   // the account that acted (its login's id), as it was then
  actorName?: string; // the person's name at the time; a laboratory is only «laboratory»
  subject?: string;   // what was acted on, "kind:id"
  before?: unknown;   // what changed, as data — never a laboratory's name
  after?: unknown;
}

// A self-service application (заявка) submitted by a lab against an open scheme.
// Pending until an owner approves it (then a Participant + code is created).
export type ApplicationStatus = "pending" | "approved" | "rejected";
export interface Application {
  id: string;
  schemeId: string;
  submittedAt: string; // ISO timestamp
  // step 1 — basic info
  labName: string;
  accreditationCert: string;
  manager: string;
  contactPerson: string;
  email: string;
  phone: string;
  // step 2 — invoice data
  companyName: string;
  registeredAddress: string;
  eik: string; // ЕИК
  vat: string; // ДДС №
  mol: string; // МОЛ
  deliveryAddress: string;
  postalCode: string;
  // step 3 — selected characteristics → number of participations (key = parameter index)
  selections: Record<string, number>;
  status: ApplicationStatus;
  // Phase 2b: set when a logged-in lab applies, so approval links the resulting
  // participant to that lab's account. Absent for first-time public submissions.
  labId?: string;
}

// A public "apply for a laboratory account" request (lab onboarding). Distinct from
// Application above (which is a lab applying to a specific scheme). Pending until a
// manager approves — only then is a real Lab + Supabase login created. See
// migrations/0013_lab_applications.sql and lib/lab-applications.ts.
export type LabApplicationStatus = "pending" | "approved" | "rejected";
export type LabRegion = "eu" | "non_eu";
export type VatStatus = "valid" | "invalid" | "unavailable";
export interface LabApplication {
  id: string;
  status: LabApplicationStatus;
  region: LabRegion;
  orgName: string;
  country: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  accreditationBody: string;
  accreditationNo: string;
  eik: string; // ЕИК / company id (EU path)
  vat: string; // VAT / ДДС № (EU path)
  eikValid?: boolean; // checksum result (undefined = not provided / N/A)
  vatStatus?: VatStatus; // VIES result (undefined = not provided)
  vatName?: string; // company name from VIES (staff cross-check)
  docPaths: string[]; // private storage keys for non-EU documents
  rejectReason?: string;
  reviewedBy?: string;
  reviewedAt?: string; // ISO
  createdAt: string; // ISO
  // ── part 9.1: the three levels at once (migration 0049) ──
  /** «account» — the old request for a laboratory account; «entity» — a registration of a legal entity
   *  with its first laboratory and its administrator; «join» — a request to join an existing entity */
  kind?: "account" | "entity" | "join";
  officialEmail?: string;
  mol?: string;
  language?: "bg" | "en";
  labName?: string;
  deliveryAddress?: string;
  position?: string;
  /** a join: the entity asked; an approved registration: the entity made */
  entityId?: string;
  /** who decided a join: the entity's administrator, or PTS on a signed letter */
  decidedAs?: "admin" | "pts";
  letterPath?: string;
}

// A ready-made file uploaded into a document's slot (PDF / image scan), instead of
// or alongside the app-built version. Stored in the private "scheme-docs" bucket
// (path = the storage key, or a data: URL in the no-DB dev fallback). Confidential.
// ── Notifications (Phase 1) ───────────────────────────────────────────────────
// Every notice the app raises is RECORDED first and delivered second. That keeps
// the two concerns apart: the record is written the moment something happens, and
// a transport (e-mail, later) reads the records. Nothing is lost while mail is not
// yet configured, and the owner/lab still see the notice in the portal.
//
// The message text is rendered in BOTH languages at write time rather than stored
// as a key, so the record says what was actually said — rewording the app later
// cannot rewrite history. §4.2: a notice may carry a participant CODE, never a name.
export type NotifyKind =
  | "application.received"   // → provider: a lab applied
  | "application.approved"   // → lab: you are in, here is your code
  | "application.rejected"   // → lab
  | "invoice.ready"          // → lab: proforma uploaded for you
  | "docs.sent"              // → lab: documents released
  | "items.dispatched"       // → lab: sample/device on its way
  | "receipt.confirmed"      // → provider: lab confirmed it arrived
  | "results.returned"       // → provider: lab sent its results back
  | "results.due"            // → lab: reminder, one day before
  | "report.issued"          // → lab: report/certificate ready
  | "scheme.not_held"        // → lab: the scheme is not held (О9, part 3.2)
  | "scheme.amended"         // → lab: the scheme was amended by an order (part 3.3)
  | "deadline.extended"      // → lab: its own deadline extended, by an order (part 3.4)
  | "participation.refused"  // → lab: its application refused, with category and reason (part 5.1)
  | "scheme.announced"       // → lab: first announcement — the scheme runs (part 5.2)
  | "scheme.final_list"      // → lab: second announcement — its own characteristics that run and drop (part 5.2)
  | "participation.coded"    // → lab: its code, drawn at the coding act, and its objects (part 5.3)
  | "device.moved"           // → lab: the calibration device is coming to you
  | "delivery.problem"       // → provider: a participant signalled a problem with its object (part 5.6)
  | "receipt.due"            // → lab: reminder — its receipt protocol is awaited (part 5.6, template)
  | "message"                // → lab: a one-way message a person at PTS wrote (part 5.10; Реш. 116)
  | "results.unlocked"       // → lab: PTS unlocked its results form after the deadline (part 6.4; Реш. 111)
  | "results.corrected"      // → lab: PTS recorded a used value next to its submitted one (part 6.5)
  | "results.locked";        // → lab: the submission is locked (processing started) and none came from it — N/R (part 6.6)

export interface Notification {
  id: string;
  kind: NotifyKind;
  audience: "provider" | "lab";
  labId?: string;    // which lab, when audience is "lab"
  schemeId?: string;
  code?: string;     // participant code — NEVER a laboratory name
  // a message to ONE organisation (part 5.10, migration 0041): its legal entity's id — no
  // scheme, no code; its users who receive notices are its recipients
  entityId?: string;
  bg: string;        // the message itself, both languages, fixed at write time
  en: string;
  href?: string;     // where clicking it should take the reader
  createdAt: string;
  readAt?: string;   // in-app read state
  emailedAt?: string; // set by the transport once it actually goes out (Phase 2)
  // Part 0.8 (Реш. 138): a notice to a laboratory is HELD until a person releases
  // it — seen in no portal and sent by no transport before releasedAt is set. A
  // withheld one is never sent; it stays as the record. Provider notices aren't held.
  releasedAt?: string;
  releasedBy?: string;
  withheldAt?: string;
  withheldBy?: string;
}

// ── The calibration chain ────────────────────────────────────────────────────
// The device's journey as an ORDERED LIST OF STOPS. A stop is either a
// participating laboratory (by CODE — never a name) or the reference laboratory,
// which may appear once, twice (start and end, which is what the stability
// formula u_stab = |X_ref1 − X_ref2| / (2·√3) implies) or not at all. Modelling it as
// a plain list is what lets all three shapes work without the code caring.
//
// PTS is implicit at both ends and is not a stop: the owner confirms the first
// dispatch and the final return himself.
export type ChainStopKind = "lab" | "ref";

// How PTS learned of a receipt or handover it records on a stop's behalf (part 0.10).
export type ChainStampSource = "phone" | "email" | "protocol" | "courier" | "in_person" | "other";

// Who recorded a chain step. A laboratory stamps its own stop from its account; PTS
// can stamp ANY stop — a reference laboratory has no account at all, and a lab may
// simply phone — and then says how it knows (part 0.10, N25 / E6.c).
export interface ChainStamp {
  by: "lab" | "pts";
  recordedAt: string;         // ISO — when it was entered (receivedAt/sentAt = when it HAPPENED)
  recordedBy?: string;        // the PTS member's e-mail (by === "pts"); never set for a lab
  source?: ChainStampSource;  // by === "pts"
  note?: string;              // by === "pts", optional
}

export interface ChainStop {
  id: string;           // stable across reordering, so a stop can be moved safely
  kind: ChainStopKind;
  code?: string;        // participant code, when kind === "lab"
  receivedAt?: string;  // ISO — the device arrived here
  sentAt?: string;      // ISO — this stop handed it on
  received?: ChainStamp; // who recorded the arrival (absent on stops stamped before part 0.10)
  sent?: ChainStamp;     // who recorded the handover
  windowDue?: string;    // its window as it stood when handed on (3.4) — kept, not recounted
}

export interface SchemeChain {
  stops: ChainStop[];
  // The owner's own guess at how long a laboratory keeps the device. Only ever
  // used until the round produces real hops to average — see lib/chain.ts. It is
  // an estimate for the waiting labs and nothing else: it enforces no deadline.
  daysPerLab?: number;
  // The window each laboratory has, in WORKING days from its own receipt (part 3.4,
  // Q14) — the holiday calendar taken off. Absent: 3, as the portal's Instruction says.
  windowWorkDays?: number;
  dispatchedAt?: string; // the owner confirmed the first send
  returnedAt?: string;   // the owner confirmed the final return
}

// A file that was replaced or removed (part 0.9, finding N9). Nothing is deleted:
// the stored object stays, and this records where it was, when, why and by whom.
export interface SupersededFile {
  where: string; // e.g. "upload:protocol", "labdoc:261101:proforma", "labupload:261101:results"
  file: UploadedDoc;
  at: string;    // ISO
  reason: "replaced" | "removed";
  by: string;    // the actor (staff e-mail, or lab:<account id>)
}

// The edition a released document went out as (part 3.0).
export interface ReleasedEdition {
  id: string; // doc_editions.id
  no: number;
  at: string; // ISO — when it was released
}

export interface UploadedDoc {
  path: string; // private storage key, or "data:<mime>;base64,…" (dev fallback)
  name: string; // original filename — display only (never used as a path)
  mime: string; // "application/pdf" | "image/png" | "image/jpeg"
  size: number; // bytes
  uploadedAt: string; // ISO
  uploadedBy: string; // actor email
  roundAt?: string; // a laboratory's file: the round's clock when it came (1.3) — what counts against a deadline (3.4)
  number?: string; // a proforma's or an invoice's number, as the accounting software gives it (5.8; Реш. 36)
  /** the report from PTS_Analysis 2.0 (7.2): the module's version it was produced by (Реш. 68) and the import */
  analysisVersion?: string;
  importId?: string;
  /** the report's file, by its hash (7.9: an ILC's report uploaded by hand is compared by it) */
  sha256?: string;
}

export interface TeamMember {
  roleEn: string;
  roleBg: string;
  name: string;
}

export interface Partner {
  nameEn: string;
  nameBg: string;
  logo?: string; // /brand/...
  locationEn: string;
  locationBg: string;
  servicesEn: string[];
  servicesBg: string[];
}

export interface Parameter {
  standardEn: string;
  standardBg: string;
  characteristicEn: string;
  characteristicBg: string;
  rangeEn: string;
  rangeBg: string;
  specimensEn: string;
  specimensBg: string;
  // σpt,min — per-characteristic lower floor for the proficiency SD (ISO 13528 /
  // Statistical project Ф 7.2.2-1 §7.4). Scoring uses σpt = max(s*, σpt,min).
  sigmaMin?: number;
  // ── part 3.6 (lib/characteristics-model) ──
  id?: string;               // stable — never reused, never moved by a reorder («ch-N»)
  unit?: string;
  step?: number;             // the reporting step
  guardMin?: number;         // absolute guard limits — 2.0's physical_min / physical_max
  guardMax?: number;
  uRequired?: boolean;       // the expanded uncertainty is required
  group?: string;            // the statistical group (processed together)
  groupEn?: string;
  determinations?: number;   // 1–3 while 2.0's contract has three columns (D3) — its `specimens`
  // the 2.0 configuration fields, as entered, passed through, never shown to labs (D3)
  engine?: Partial<Record<EngineField, string>>;
}

// One result-entry table on the Results Sheet (F 7.2.1-7): a tested characteristic
// with its standard, the number of specimen columns and the unit. A scheme can list
// these explicitly (e.g. a "dimensions" parameter → Length / Width / Thickness);
// otherwise the Results Sheet derives one table per Parameter.
export interface ResultTable {
  nameEn: string;
  nameBg: string;
  standardEn: string;
  standardBg: string;
  specimens: number; // number of specimen columns (I, II, III …)
  unit: string; // mm, %, MPa …
}

export interface ScheduleItem {
  date: string; // dd.mm.yyyy
  labelEn: string;
  labelBg: string;
}

export interface PriceRow {
  characteristicEn: string;
  characteristicBg: string;
  first: string; // e.g. "120 €"
  additional: string;
}

export interface Clause {
  en: string;
  bg: string;
}

// Calibration-only data (scheme.type === "C"). Calibration spans force, mass,
// temperature, torque, pressure — so the quantity + unit + reference lab vary.
export interface CalibrationData {
  quantityEn: string; // "Force"
  quantityBg: string; // "Сила"
  unit: string; // "kN"
  deviceEn: string;
  deviceBg: string;
  points: string[]; // calibration points, e.g. ["20","40",…,"200"]
  pointIds?: string[]; // each point's stable id — its row, 2.0's characteristic_id (3.6)
  directionsEn: string[]; // e.g. ["Tension","Compression"] ([] if none)
  directionsBg: string[];
  referenceLabEn: string;
  referenceLabBg: string;
  referenceLabLocEn: string;
  referenceLabLocBg: string;
  methodEn: string; // "ISO 376 — direct comparison method"
  methodBg: string;
  feeEn: string;
  feeBg: string;
  stabilityFormula: string; // "u_stab = |X_ref1 − X_ref2| / (2·√3)" (D22)
  enCriterionEn: string; // "Eₙ = (X_lab − X_ref)/√(U_lab²+U_ref²); satisfactory when |Eₙ| ≤ 1"
  enCriterionBg: string;
  // PTS's review after the deadline (6.7) — optional; as typed, numbers (comma or point):
  refTolerance?: string;  // ± the realised reference value may differ from the nominal, in the unit
  tempMin?: string;       // the temperature in the measurement volume the scheme declares, °C — from
  tempMax?: string;       // …to
}

// Manually-entered scoring inputs. The scores themselves (z / ζ / Eₙ) are always
// computed from these by stats.ts — never stored — so the math lives in one place.
// "Entered manually for now; auto-compute (robust mean) later" (project rule).
export interface AssignedValue {
  xpt: number; // assigned value (testing) or reference value X_ref (calibration)
  sigma: number; // σ for proficiency assessment (testing; 0 for calibration)
  u: number; // u(xpt) (testing) / expanded U_ref (calibration)
}
export interface ResultEntry {
  value: number; // the participant's reported result (the mean)
  u: number; // the participant's reported uncertainty (U_lab for calibration)
  // F 7.2.1-5 — the individual determinations I/II/III behind the mean, positional
  // (null = that determination not reported). Absent for older/summary-only entries.
  determinations?: (number | null)[];
}
export interface Scoring {
  // metric key — testing: parameter index "0","1",… · calibration: `${dirIdx}:${pointIdx}`
  assigned: Record<string, AssignedValue>;
  // results[participantCode][metricKey]
  results: Record<string, Record<string, ResultEntry>>;
}

export interface Scheme {
  id: string; // url-safe, e.g. "26-01-T-1"
  number: string; // display, e.g. "PTS 26/01-T-1"
  // the workflow: T — many identical objects at once (testing, and sampling until its
  // own screens come); C — one instrument travelling lab to lab (calibration)
  type: "T" | "C";
  // What the number carries, kept as fields of their own (Реш. 102, part 3.1; lib/
  // scheme-number): PTS or ILC; the activity T, S or C; within the accredited scope
  // (true) or NA (false). What the number states, the number decides; the rest PTS
  // chooses — an archive number may state none of them. Absent on a scheme from
  // before 3.1: read through schemeMarkers().
  kind?: SchemeKind;
  activity?: Activity;
  accredited?: boolean;
  // The 19 stages' ticks and the acts that moved the scheme between its states
  // (part 3.2, lib/lifecycle-model) — who and when, never removed from the journal.
  lifecycle?: Lifecycle;
  // The amendments of a running scheme, each by the head's order (part 3.3,
  // lib/amendments-model): № 1, 2 … — appended, never changed.
  amendments?: Amendment[];
  // Individual extensions of a participant's deadline, each with its order (part 3.4,
  // lib/deadlines-model) — by code; appended, the latest per deadline in force.
  extensions?: Extension[];
  // The batches of objects and their homogeneity values (part 3.5, Реш. 151,
  // lib/batches-model) — a testing scheme's; a calibration scheme has none.
  batches?: Batch[];
  // The characteristics' configuration versions, each change on record (part 3.6), and
  // the counters that keep ids from ever being given twice.
  characteristicVersions?: CharacteristicVersion[];
  characteristicSeq?: number;
  pointSeq?: number;
  // ONE static reminder text per scheme, shown to the participants (А3; 3.6)
  staticReminder?: { bg: string; en: string };
  /** the scheme's commercial fields (3.7, Реш. 153) — prices in euro cents, the share
   *  a 2nd+ participation pays, the MT/CY/IE add-on, the own-courier pickup address,
   *  the maximum participants (hidden from laboratories) */
  commercial?: Commercial;
  /** the per-scheme lists (3.8): shipment documents, the receipt-protocol checklist,
   *  «accreditation required» (warns only, Реш. 108) */
  lists?: SchemeLists;
  /** a calibration scheme's documents on M1's structure (3.10) — set when it is made;
   *  older schemes keep theirs */
  calTemplate?: "m1";
  /** «Период на провеждане, както се изписва в доклада» — Scheme_meta.period (3.13) */
  period?: string;
  /** who supplies what for this scheme — External_providers (3.13); the plan's point 3 */
  externalProviders?: ExternalProvider[];
  status: SchemeStatus;
  titleEn: string;
  titleBg: string;
  objectEn: string;
  objectBg: string;
  coverImage?: string; // /brand/... or an uploaded https URL
  coverImageWidth?: number; // cover photo width as % of the content (default 46)
  coverImageAlign?: "left" | "center" | "right"; // cover photo placement (default center)
  distribution: "simultaneous" | "sequential";
  formNumber: string; // "F 7.2.1-1"
  revision: string; // "Revision 1"
  revisionDate: string; // "06.01.2025"
  standard: string; // "ISO/IEC 17043:2023"
  regNo: string; // "752/T-008"
  orderDate?: string; // date of the Order (Заповед) that starts the scheme
  minParticipants: number;
  team: TeamMember[];
  partner: Partner;
  parameters: Parameter[];
  // Optional explicit Results-Sheet tables (one per row); when absent the Results
  // Sheet derives one table per Parameter. See ResultTable.
  resultTables?: ResultTable[];
  schedule: ScheduleItem[];
  prices: PriceRow[];
  assignedValueMethodEn: string;
  assignedValueMethodBg: string;
  scoresEn: string;
  scoresBg: string;
  // editable section bodies, keyed by section id (see render-plan.ts)
  clauses: Record<string, Clause>;
  // present for calibration schemes (type === "C")
  calibration?: CalibrationData;
  // manually-entered results & assigned values (scores computed on the fly)
  scoring?: Scoring;
  // issued certificate numbers + dates, keyed by participant code: the number as the
  // ptsbg.eu register holds it, typed by PTS (0.15), stored so reprints keep it; who
  // confirmed it is in the register, and when — absent on numbers the portal made up
  // before 0.15, which labs no longer get (labCertificate)
  // `simulation`: a SIM round's — never entered in the register (Реш. 130, 1.2)
  // 7.7: the content typed from the issued report, its check by a second person, its release
  // (lib/cert-model) — a laboratory gets the certificate only once released
  certificates?: Record<string, import("./cert-model").CertRecord>;
  // the round's moved clock — honoured in the TEST environment only (part 1.3, lib/clock)
  testClock?: { offsetMs: number; setAt: string; setBy: string };
  // self-service applications (заявки) submitted by labs while the scheme is open
  applications?: Application[];
  // documents the owner has composed in the BLOCK builder (superseded by `docs`).
  composed?: Record<string, Block[]>;
  // documents authored in the Word-like editor — rich HTML per language, keyed by
  // document key. This is the current builder's storage.
  docs?: Record<string, { bg: string; en: string }>;
  // owner-filled values for fillable document form fields (checkboxes, options,
  // ratings, blanks). Keyed by document key → field id → value. JSONB, no migration.
  formData?: Record<string, Record<string, string>>;
  // ready-made files uploaded per document key (see UploadedDoc). Lets ANY of the 14
  // documents be filled by an external PDF/image instead of / alongside the app-built
  // version. JSONB, no migration.
  uploads?: Record<string, UploadedDoc>;
  // when both an uploaded file AND an app-built version exist for a document, which
  // one is active/official. Absent → the uploaded file wins when present (the chosen
  // default). Set to "built" to switch back to the app-built version. JSONB.
  docActive?: Record<string, "built" | "uploaded">;
  // a started (editor-built) document is only "Готов" when the owner explicitly
  // marks it so (button in the editor). Absent/false = still in progress. JSONB.
  docReady?: Record<string, boolean>;
  // files uploaded BY LABS from the lab portal, keyed by participant code → slot
  // ("protocol" = signed receipt protocol, "results" = completed results sheet).
  // Upload auto-stamps the case file + advances the status; locked once scored.
  // JSONB, no migration (lib/lab-phases.ts LAB_UPLOAD_SLOTS).
  labUploads?: Record<string, Partial<Record<string, UploadedDoc>>>;
  // ── the document exchange loop (Phase 1) ──────────────────────────────────
  // Uploading a document tells NOBODY. Sending is a separate, deliberate act:
  // the owner presses "изпрати на участниците" and only then does the file
  // appear in the labs' portals and the mail go out. This records that act —
  // docKey → when it was sent. Absent = uploaded but not released.
  sentToParticipants?: Record<string, string>; // docKey → ISO timestamp
  // The EDITION each released document went out as (part 3.0, lib/editions) — the
  // participants are served that edition's frozen file, so later edits reach them
  // only as a later edition. Absent with sentToParticipants set: released before
  // editions existed (the lab route keeps edition 1 on its first opening).
  releasedEditions?: Record<string, ReleasedEdition>;
  // Releases to ONE participation or ONE user (part 5.4, lib/release-model) — each an
  // edition, appended; a withdrawal is a date on it. JSONB, no migration.
  releases?: TargetRelease[];
  // Every file replaced or removed from this scheme, kept (part 0.9 — nothing is deleted).
  supersededFiles?: SupersededFile[];
  // Part 0.9 (finding N23): a scheme is never deleted. «Архивирай» sets these, and
  // an archived scheme is left out of every list and answers like a missing one —
  // its row, participants, documents and journal all stay.
  archivedAt?: string;
  archivedBy?: string;
  // Documents the provider sends to ONE laboratory rather than to all of them —
  // today the proforma invoice, whose amount differs per lab. The mirror image
  // of labUploads: code → slot → file. JSONB, no migration.
  labDocs?: Record<string, Partial<Record<string, UploadedDoc>>>;
  // Payment is settled outside the app by the accountant; this records it was marked.
  // Since 7.4 (D7) the issued report — and the certificate — reach a participation once
  // it is marked paid (or opened by hand, `reportAccess`). code → ISO date.
  paidAt?: Record<string, string>;
  // The four working dates that drive the LAB's view and the reminder. Kept apart
  // from `schedule` on purpose: schedule is document content the owner writes by
  // hand and prints into the Plan, and he does not want app dates leaking into
  // his documents. These never render into any document, and they gate nothing.
  // ISO yyyy-mm-dd (not the schedule's dd.mm.yyyy) because these are compared and
  // sorted — see lib/scheme-dates.ts, which owns the format and the arithmetic.
  dates?: {
    applicationsDue?: string;
    dispatch?: string;
    resultsDue?: string;
    reportDue?: string;
  };
  // ── The calibration chain (C schemes) ────────────────────────────────────
  // One device travels from laboratory to laboratory. The owner fixes the order
  // once; a laboratory learns the NEXT address only when the device is in its
  // hands. lib/chain.ts owns every rule about it. JSONB, no migration.
  chain?: SchemeChain;
  // Which day-before reminders have already gone out, keyed "<dateKey>:<ISO date>"
  // → when. The cron may run more than once a day (a retry, a redeploy, a manual
  // trigger), and a laboratory must not be reminded twice for the same deadline.
  // JSONB, no migration. See lib/notify-reminders.ts.
  remindedAt?: Record<string, string>;
  // The coding act (part 5.3, lib/coding-model): which provisional reference became which
  // code, and the objects drawn — appended, never changed. JSONB, no migration.
  coding?: CodingRecord[];
  // Delivery and receipt (part 5.6, lib/delivery-model), by the participation's id —
  // shipments, the online receipt protocols, problems signalled; appended. JSONB, no migration.
  deliveries?: import("./delivery-model").Deliveries;
  // А16 / Реш. 127: the minimum working days to a participant's results deadline for a
  // replacement object (default 10, lib/delivery-model minDaysOf)
  deliveryMinDays?: number;
  // «изисква потвърждение» per document (part 5.9; Реш. 117) — docKey → who set it, when.
  // The declaration Ф 4.2-2 always asks, with no setting (lib/ack-model). JSONB, no migration.
  ackRequired?: Record<string, import("./ack-model").AckSetting>;
  // the participations' acknowledgements and the declaration's ticks (5.9; Реш. 117, 118):
  // per participation and edition, with the account, the moment and — for the declaration —
  // the hash of the edition's frozen file. Appended, never rewritten.
  acknowledgements?: import("./ack-model").Acknowledgement[];
  // the one-way messages its people sent (part 5.10; Реш. 116) — to one participation or to
  // everyone going on: the target, the text, who, when. Appended; the history on its pages.
  messages?: import("./messages-model").SchemeMessage[];
  // unlocks of a participation's results form after the deadline (part 6.4; Реш. 111: after the
  // deadline a result comes in only through PTS) — who, when, why, until; appended
  resultUnlocks?: import("./submission-model").ResultUnlock[];
  /** «Заключи подаването» (6.6; Реш. 21): each lock (with «Започни обработката») — the version
   *  taken per participation in the final round, or none (N/R) — and each reopening («Върни»). */
  submissionLocks?: import("./submission-lock-model").SubmissionLock[];
  /** PTS's review after the deadline (6.7): each participation's individual note — appended; the
   *  latest is in force, an empty one withdraws it. Never shown to a laboratory before the report. */
  reviewNotes?: import("./review-model").ReviewNote[];
  /** What came back from PTS_Analysis 2.0 (7.2): each import — the module's version, the files as
   *  they came (never recomputed), who and when. Appended; the latest is in force. */
  analysisImports?: import("./analysis-import-model").AnalysisImport[];
  /** Each export to 2.0 (7.3): what was sent — the codes and the characteristics, the file's hash. */
  analysisExports?: import("./transfer-check-model").AnalysisExportRecord[];
  /** The transfer checks (7.3; Manual 7.5.2): 2.0's report lists the same codes and characteristics — yes / no. */
  transferChecks?: import("./transfer-check-model").TransferCheck[];
  /** The report's issues (7.4): R1 at the act, each correction R2… with its reason and scope — the
   *  edition, the 2.0 version, the check relied on, the scheme's software record. Appended. */
  reportIssues?: import("./report-issue-model").ReportIssue[];
  /** How the issued report reached each participation (7.4; D7): its payment marked, or opened by
   *  hand with a reason — code → record. Once reached, it stays. */
  reportAccess?: Record<string, import("./report-issue-model").ReportAccess>;
  /** The scheme manager's confirmations that 2.0's report shows u(x_pt) ≤ 0.3·σ_pt (7.6; К16) —
   *  each bound to the report it was read from (its hash). Appended. */
  uxptChecks?: import("./uxpt-model").UxptCheck[];
  // A calibration scheme's reference values per point (part 5.7, lib/reference-values-model)
  // — x_ref before and after, u_calibration, u_other, k, for 2.0's «Calibration» sheet (D3);
  // each save a version, appended. JSONB, no migration.
  referenceValues?: import("./reference-values-model").ReferenceValues;
  /** a REPLAY round (plan part 8.2; Реш. 130, 134): a closed round loaded from its 2.0 input file,
   *  codes only, in the test environment — the original number, the file kept and its hash, what
   *  was carried and what was said; its re-export is compared with the file (8.3) */
  replay?: { of: string; /** the round's kind, frozen at the load (8.4 review) */ kind?: "pts-t" | "calibration" | "ilc" | "sampling"; /** the importer's word on the kind, where the old number said none */ kindGiven?: "T" | "S" | "ILC"; importId: string; fileSha256: string; sourcePath: string; importedAt: string; by: string; counts: { participants: number; characteristics: number; results: number; nr: number }; said: { excluded: string[]; nrNotes: string[] }; failed?: string };
  // chosen document skin (visual theme) id; absent → the built-in "Classic" skin.
  skin?: string;
  // friendly folder name shown in the explorer; absent → falls back to the title/number.
  name?: string;
  // (former `announced`: dropped in part 0.3 — nothing unstarted is shown to labs,
  // Реш. 147. Old scheme rows may still carry the key; nothing reads it.)
  // which explorer folder this scheme lives in (null/absent = directly under the
  // type root). Placement is by folder now, independent of the number's year.
  folderId?: string;
}

// A block in the document builder. The owner stacks these to author a document.
//   heading/text → editable prose (bg + auto-drafted en)
//   field        → an auto-filled element pulled live from the scheme (always consistent)
export interface Block {
  id: string;
  type: "heading" | "text" | "field";
  bg?: string;
  en?: string;
  field?: string; // when type === "field": "header" | "parameters" | "schedule" | …
}
