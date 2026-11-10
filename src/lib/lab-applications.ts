import { randomUUID } from "crypto";
import type { LabApplication, LabApplicationStatus, LabRegion, VatStatus } from "./types";
import { getDb, noMemoryFallback } from "./supabase";

// Store for public lab-account applications (onboarding). Same graceful pattern as
// labs.ts/staff.ts: Supabase when configured, else in-memory. Written only by the
// server (public submit action + manager review) using the service-role client;
// RLS is on with no public policy, so the browser can never touch this table.

// shared across every server entry point, as the other stores are (a module-local
// copy hid entries written from another bundle in dev — part 1.4/1.5)
const memStore = globalThis as unknown as { __ptsLabAppMem?: Map<string, LabApplication> };
const mem: Map<string, LabApplication> = memStore.__ptsLabAppMem ?? (memStore.__ptsLabAppMem = new Map());
let warned = false;
function warn(e: unknown) {
  noMemoryFallback("lab-applications", e); // on a deployment: an error, not memory (1.1)
  if (warned) return;
  warned = true;
  console.warn("[lab-applications] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

const norm = (email: string) => email.trim().toLowerCase();

function toRow(a: LabApplication) {
  return {
    id: a.id, status: a.status, region: a.region, org_name: a.orgName, country: a.country,
    contact_person: a.contactPerson, email: a.email, phone: a.phone, address: a.address,
    accreditation_body: a.accreditationBody, accreditation_no: a.accreditationNo,
    eik: a.eik, vat: a.vat, eik_valid: a.eikValid ?? null, vat_status: a.vatStatus ?? null,
    vat_name: a.vatName ?? null, doc_paths: a.docPaths, reject_reason: a.rejectReason ?? null,
    reviewed_by: a.reviewedBy ?? null, reviewed_at: a.reviewedAt ?? null, created_at: a.createdAt,
    // 9.1 (0049)
    kind: a.kind ?? "account", official_email: a.officialEmail ?? "", mol: a.mol ?? "", language: a.language ?? "bg",
    lab_name: a.labName ?? "", delivery_address: a.deliveryAddress ?? "", position: a.position ?? "",
    entity_id: a.entityId ?? null, decided_as: a.decidedAs ?? null, letter_path: a.letterPath ?? null,
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): LabApplication {
  return {
    id: r.id, status: (r.status as LabApplicationStatus) ?? "pending", region: (r.region as LabRegion) ?? "eu",
    orgName: r.org_name ?? "", country: r.country ?? "", contactPerson: r.contact_person ?? "",
    email: r.email ?? "", phone: r.phone ?? "", address: r.address ?? "",
    accreditationBody: r.accreditation_body ?? "", accreditationNo: r.accreditation_no ?? "",
    eik: r.eik ?? "", vat: r.vat ?? "",
    eikValid: r.eik_valid ?? undefined, vatStatus: (r.vat_status as VatStatus) ?? undefined,
    vatName: r.vat_name ?? undefined, docPaths: (r.doc_paths as string[]) ?? [],
    rejectReason: r.reject_reason ?? undefined, reviewedBy: r.reviewed_by ?? undefined,
    reviewedAt: r.reviewed_at ?? undefined, createdAt: r.created_at ?? "",
    kind: (r.kind as LabApplication["kind"]) ?? "account", officialEmail: r.official_email ?? "", mol: r.mol ?? "", language: r.language === "en" ? "en" : "bg",
    labName: r.lab_name ?? "", deliveryAddress: r.delivery_address ?? "", position: r.position ?? "",
    entityId: r.entity_id ?? undefined, decidedAs: (r.decided_as as LabApplication["decidedAs"]) ?? undefined, letterPath: r.letter_path ?? undefined,
  };
}

export async function addLabApplication(input: {
  region: LabRegion; orgName: string; country: string; contactPerson: string; email: string;
  phone: string; address: string; accreditationBody: string; accreditationNo: string;
  eik?: string; vat?: string; eikValid?: boolean; vatStatus?: VatStatus; vatName?: string;
  docPaths?: string[];
  // 9.1 — the three levels at once (0049)
  kind?: LabApplication["kind"]; officialEmail?: string; mol?: string; language?: "bg" | "en";
  labName?: string; deliveryAddress?: string; position?: string; entityId?: string;
}): Promise<LabApplication> {
  const a: LabApplication = {
    id: randomUUID(),
    status: "pending",
    region: input.region,
    orgName: input.orgName,
    country: input.country,
    contactPerson: input.contactPerson,
    email: norm(input.email),
    phone: input.phone,
    address: input.address,
    accreditationBody: input.accreditationBody,
    accreditationNo: input.accreditationNo,
    eik: input.eik ?? "",
    vat: input.vat ?? "",
    eikValid: input.eikValid,
    vatStatus: input.vatStatus,
    vatName: input.vatName,
    docPaths: input.docPaths ?? [],
    createdAt: new Date().toISOString(),
    kind: input.kind ?? "account",
    officialEmail: input.officialEmail ?? "", mol: input.mol ?? "", language: input.language ?? "bg",
    labName: input.labName ?? "", deliveryAddress: input.deliveryAddress ?? "", position: input.position ?? "",
    entityId: input.entityId,
  };
  const db = getDb();
  if (!db) { mem.set(a.id, a); return a; }
  try {
    const { error } = await db.from("lab_applications").insert(toRow(a));
    if (error) throw error;
  } catch (e) {
    warn(e);
    mem.set(a.id, a);
  }
  return a;
}

export async function listLabApplications(status?: LabApplicationStatus): Promise<LabApplication[]> {
  const db = getDb();
  if (!db) {
    const all = [...mem.values()].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
    return status ? all.filter((a) => a.status === status) : all;
  }
  try {
    let q = db.from("lab_applications").select("*").order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    const all = [...mem.values()].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
    return status ? all.filter((a) => a.status === status) : all;
  }
}

// How many pending applications share this e-mail (a lab spamming the form). Used to
// throttle duplicate submissions from the same address.
export async function countPendingByEmail(email: string): Promise<number> {
  const key = norm(email);
  if (!key) return 0;
  const db = getDb();
  if (!db) return [...mem.values()].filter((a) => a.email === key && a.status === "pending").length;
  try {
    const { count, error } = await db
      .from("lab_applications")
      .select("id", { count: "exact", head: true })
      .eq("email", key)
      .eq("status", "pending");
    if (error) throw error;
    return count ?? 0;
  } catch (e) {
    warn(e);
    return [...mem.values()].filter((a) => a.email === key && a.status === "pending").length;
  }
}

export async function getLabApplication(id: string): Promise<LabApplication | null> {
  if (!id) return null;
  const db = getDb();
  if (!db) return mem.get(id) ?? null;
  try {
    const { data, error } = await db.from("lab_applications").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : null;
  } catch (e) {
    warn(e);
    return mem.get(id) ?? null;
  }
}

export async function setLabApplicationReview(
  id: string,
  patch: { status: LabApplicationStatus; rejectReason?: string; reviewedBy?: string },
): Promise<void> {
  const reviewedAt = new Date().toISOString();
  const db = getDb();
  if (db) {
    try {
      const { error } = await db
        .from("lab_applications")
        .update({
          status: patch.status,
          reject_reason: patch.rejectReason ?? null,
          reviewed_by: patch.reviewedBy ?? null,
          reviewed_at: reviewedAt,
        })
        .eq("id", id);
      if (error) throw error;
      return;
    } catch (e) {
      warn(e);
    }
  }
  const cur = mem.get(id);
  if (cur) mem.set(id, { ...cur, status: patch.status, rejectReason: patch.rejectReason, reviewedBy: patch.reviewedBy, reviewedAt });
}

/** Part 9.1: a registration's decision and what it made — claimed only while it is still
 *  pending (`onlyPending`): true when this call changed it, false when someone decided it
 *  first. The review's time is set with a decision. */
export async function patchLabApplication(
  id: string,
  patch: Partial<Pick<LabApplication, "status" | "rejectReason" | "reviewedBy" | "entityId" | "decidedAs" | "letterPath" | "kind">>,
  guard: boolean | { pending?: boolean; noEntity?: boolean } = false,
): Promise<boolean> {
  // `true` — only while pending; `noEntity` — only while it names no entity yet (9.1 review: an
  // approval saves the entity it makes BEFORE making it, once)
  const g = typeof guard === "boolean" ? { pending: guard } : guard;
  const onlyPending = !!g.pending;
  const reviewedAt = patch.status && patch.status !== "pending" ? new Date().toISOString() : undefined;
  const row: Record<string, unknown> = {};
  if ("status" in patch) row.status = patch.status;
  if ("rejectReason" in patch) row.reject_reason = patch.rejectReason ?? null;
  if ("reviewedBy" in patch) row.reviewed_by = patch.reviewedBy ?? null;
  if ("entityId" in patch) row.entity_id = patch.entityId ?? null;
  if ("decidedAs" in patch) row.decided_as = patch.decidedAs ?? null;
  if ("letterPath" in patch) row.letter_path = patch.letterPath ?? null;
  if ("kind" in patch) row.kind = patch.kind;
  if ("status" in patch) row.reviewed_at = reviewedAt ?? null;
  const db = getDb();
  if (db) {
    let q = db.from("lab_applications").update(row).eq("id", id);
    if (onlyPending) q = q.eq("status", "pending");
    if (g.noEntity) q = q.is("entity_id", null);
    const { data, error } = await q.select("id");
    if (error) throw new Error(`The registration could not be saved: ${error.message}`, { cause: error });
    return (data ?? []).length > 0;
  }
  const cur = mem.get(id);
  if (!cur || (onlyPending && cur.status !== "pending") || (g.noEntity && cur.entityId)) return false;
  mem.set(id, { ...cur, ...patch, ...("status" in patch ? { reviewedAt } : {}) });
  return true;
}

/** The requests to join this entity still waiting (9.1) — for its administrator, or PTS. */
export async function listJoinRequests(entityId?: string): Promise<LabApplication[]> {
  const db = getDb();
  const fromMem = () => [...mem.values()].filter((a) => a.kind === "join" && a.status === "pending" && (!entityId || a.entityId === entityId)).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
  if (!db) return fromMem();
  let q = db.from("lab_applications").select("*").eq("kind", "join").eq("status", "pending").order("created_at", { ascending: false });
  if (entityId) q = q.eq("entity_id", entityId);
  const { data, error } = await q;
  if (error) throw new Error(`The join requests could not be read: ${error.message}`, { cause: error });
  return (data ?? []).map((r) => fromRow(r as Row));
}

/** An erased profile (4.7) takes its registrations with it (9.1 review): every one that names the entity —
 *  the one that made it, the requests to join it — anonymised (the record kept, as the database keeps a
 *  registration: 0037), a waiting one refused. Returns the stored papers and letters, for the caller to
 *  remove. Throws when it cannot. */
export async function eraseRegistrationsOf(entityId: string): Promise<{ rows: number; files: string[] }> {
  const blank = (a: Pick<LabApplication, "id">) => ({
    org_name: "‹изтрито по искане›", country: "XX", contact_person: "‹изтрит›", email: `erased-${a.id}@erased.invalid`, phone: "", address: "—",
    accreditation_body: "", accreditation_no: "", eik: "", vat: "", vat_name: null, doc_paths: [] as string[], official_email: "", mol: "",
    lab_name: "", delivery_address: "", position: "", letter_path: null,
  });
  const ERASED = "профилът е изтрит по искане · the profile was erased on request";
  const db = getDb();
  if (db) {
    const { data, error } = await db.from("lab_applications").select("*").eq("entity_id", entityId);
    if (error) throw new Error(`The registrations could not be read: ${error.message}`, { cause: error });
    const rows = (data ?? []).map((r) => fromRow(r as Row));
    const now = new Date().toISOString();
    for (const a of rows) {
      const { error: e } = await db.from("lab_applications").update({ ...blank(a), ...(a.status === "pending" ? { status: "rejected", reviewed_at: now, reviewed_by: "erasure" } : {}), ...(a.rejectReason || a.status === "pending" ? { reject_reason: ERASED } : {}) }).eq("id", a.id);
      if (e) throw new Error(`The registration could not be erased: ${e.message}`, { cause: e });
    }
    return { rows: rows.length, files: rows.flatMap((a) => [...a.docPaths, ...(a.letterPath ? [a.letterPath] : [])]) };
  }
  const rows = [...mem.values()].filter((a) => a.entityId === entityId);
  const now = new Date().toISOString();
  for (const a of rows) mem.set(a.id, {
    ...a, orgName: "‹изтрито по искане›", country: "XX", contactPerson: "‹изтрит›", email: `erased-${a.id}@erased.invalid`, phone: "", address: "—", accreditationBody: "", accreditationNo: "",
    eik: "", vat: "", vatName: undefined, docPaths: [], officialEmail: "", mol: "", labName: "", deliveryAddress: "", position: "", letterPath: undefined,
    ...(a.status === "pending" ? { status: "rejected" as const, reviewedAt: now, reviewedBy: "erasure" } : {}), ...(a.rejectReason || a.status === "pending" ? { rejectReason: ERASED } : {}),
  });
  return { rows: rows.length, files: rows.flatMap((a) => [...a.docPaths, ...(a.letterPath ? [a.letterPath] : [])]) };
}

/** Remove a rejected registration whose six years are over (4.7, Zadanie §10) — the
 *  database refuses any other (migration 0037); memory the same. Returns its stored
 *  documents' keys, for the caller to remove too; throws when it may not be removed. */
export async function removeLabApplication(id: string, nowMs: number = Date.now()): Promise<string[]> {
  const { retentionOver } = await import("./retention-model");
  const db = getDb();
  if (db) {
    const { data, error } = await db.from("lab_applications").delete().eq("id", id).select("doc_paths, letter_path");
    if (error) throw new Error(`The registration could not be removed: ${error.message}`, { cause: error });
    // its documents, and the signed letter of a join PTS decided (9.1) — removed with it
    return ((data ?? []) as { doc_paths: string[] | null; letter_path?: string | null }[]).flatMap((r) => [...(r.doc_paths ?? []), ...(r.letter_path ? [r.letter_path] : [])]);
  }
  const cur = mem.get(id);
  if (!cur) return [];
  if (!retentionOver({ status: cur.status, reviewedAt: cur.reviewedAt }, nowMs)) throw new Error("The registration could not be removed: lab_applications: a registration is kept — a rejected one six years from its rejection (Zadanie §10)");
  mem.delete(id);
  return [...(cur.docPaths ?? []), ...(cur.letterPath ? [cur.letterPath] : [])];
}
