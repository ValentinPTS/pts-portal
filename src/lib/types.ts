// The Scheme is the single source of truth. Every document is generated from it,
// so a value (number, date, standard, name) is entered once and is identical
// across all documents and both languages — eliminating the copy-paste drift
// found in the real files (see ../../PROJECT-ANATOMY.md).

export type Lang = "en" | "bg";

// Optional per-render context. The route resolves participant data and passes it
// here, so the document renderers stay pure (no store/async access inside a
// renderer). `participant` = one lab (Certificate); `participants` = the full
// list (List of Registered Participants).
export interface DocOptions {
  participant?: { code: string; labName: string; certNo?: string; certDate?: string };
  participants?: {
    code: string;
    labName: string;
    country: string;
    contact?: string;
    email?: string;
    phone?: string;
    deliveryAddress?: string;
    participations?: number;
  }[];
}

// Scheme lifecycle. "open" = visible to labs online (apply); see PROJECT-ANATOMY.md.
export type SchemeStatus = "draft" | "open" | "running" | "report" | "closed";

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

export interface Participant {
  id: string;
  schemeId: string;
  code: string; // random, unique within the scheme
  labName: string;
  contact: string;
  email: string;
  phone: string;
  country: string;
  deliveryAddress: string; // address the PT items are shipped to (PTS-L 4.4-1)
  participations: number; // how many times this lab has participated (PTS-L 4.4-1)
  status: ParticipantStatus;
  // Phase 2b: links this participation to the lab's permanent account (lib/labs.ts).
  // Absent for older/owner-added participants until linked. Indexed for the lab portal.
  labId?: string;
}

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
  stabilityFormula: string; // "u_stab = |X_ref1 − X_ref2| / √3"
  enCriterionEn: string; // "Eₙ = (X_lab − X_ref)/√(U_lab²+U_ref²); satisfactory when |Eₙ| ≤ 1"
  enCriterionBg: string;
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
  value: number; // the participant's reported result
  u: number; // the participant's reported uncertainty (U_lab for calibration)
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
  type: "T" | "C";
  status: SchemeStatus;
  titleEn: string;
  titleBg: string;
  objectEn: string;
  objectBg: string;
  coverImage?: string; // /brand/...
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
  // issued certificate numbers + dates, keyed by participant code. Generated
  // once per lab and stored, so reprints keep the same number (project rule).
  certificates?: Record<string, { no: string; date: string }>;
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
  // chosen document skin (visual theme) id; absent → the built-in "Classic" skin.
  skin?: string;
  // friendly folder name shown in the explorer; absent → falls back to the title/number.
  name?: string;
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
