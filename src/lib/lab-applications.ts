import { randomUUID } from "crypto";
import type { LabApplication, LabApplicationStatus, LabRegion, VatStatus } from "./types";
import { getDb } from "./supabase";

// Store for public lab-account applications (onboarding). Same graceful pattern as
// labs.ts/staff.ts: Supabase when configured, else in-memory. Written only by the
// server (public submit action + manager review) using the service-role client;
// RLS is on with no public policy, so the browser can never touch this table.

const mem = new Map<string, LabApplication>();
let warned = false;
function warn(e: unknown) {
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
  };
}

export async function addLabApplication(input: {
  region: LabRegion; orgName: string; country: string; contactPerson: string; email: string;
  phone: string; address: string; accreditationBody: string; accreditationNo: string;
  eik?: string; vat?: string; eikValid?: boolean; vatStatus?: VatStatus; vatName?: string;
  docPaths?: string[];
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
