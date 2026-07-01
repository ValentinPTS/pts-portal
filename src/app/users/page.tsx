import { listStaff } from "@/lib/staff";
import { listLabs } from "@/lib/labs";
import { listLabApplications } from "@/lib/lab-applications";
import { getDb } from "@/lib/supabase";
import { ownerEmails } from "@/lib/auth";
import { requireManager, getRoleContext } from "@/lib/roles";
import { getServerT } from "@/lib/i18n-server";
import UsersTable, { type UserRow } from "@/components/UsersTable";
import PendingLabApplications, { type PendingAppView } from "@/components/PendingLabApplications";

// Manager-only "Users & roles" screen (Phase RT1). Lists internal staff (editable
// role + active/inactive), founders from OWNER_EMAILS (always Manager, read-only),
// and laboratory accounts (active/inactive). Filter All / Staff / Labs is handled
// client-side in UsersTable. Gated by requireManager() (no-op until login is on).
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireManager();
  const { tr } = await getServerT();
  const ctx = await getRoleContext();
  const me = ctx.email;

  const [staff, labs, pendingApps] = await Promise.all([listStaff(), listLabs(), listLabApplications("pending")]);
  const founders = ownerEmails();
  const founderSet = new Set(founders);

  // Build the review view for pending applications, minting short-lived (5-min)
  // signed URLs for any non-EU documents so staff can open them without exposing the
  // private bucket. Generated server-side each load (the page is force-dynamic).
  const db = getDb();
  const pending: PendingAppView[] = await Promise.all(
    pendingApps.map(async (a) => {
      const docs: { name: string; url: string }[] = [];
      if (db && a.docPaths.length) {
        for (const path of a.docPaths) {
          try {
            const { data } = await db.storage.from("lab-docs").createSignedUrl(path, 300);
            if (data?.signedUrl) docs.push({ name: path.split("/").pop() ?? "document", url: data.signedUrl });
          } catch { /* skip an unsignable key */ }
        }
      }
      return {
        id: a.id, orgName: a.orgName, country: a.country, region: a.region, email: a.email,
        phone: a.phone, contactPerson: a.contactPerson, address: a.address,
        accreditationBody: a.accreditationBody, accreditationNo: a.accreditationNo,
        eik: a.eik, vat: a.vat, eikValid: a.eikValid ?? null, vatStatus: a.vatStatus ?? null,
        vatName: a.vatName ?? null, createdAt: a.createdAt, docs,
      };
    }),
  );

  const rows: UserRow[] = [
    // founders first (always managers, read-only)
    ...founders.map((email) => ({ kind: "founder" as const, email, you: !!me && me === email })),
    // internal staff (skip any that are also founders to avoid duplicates)
    ...staff
      .filter((u) => !founderSet.has(u.email))
      .map((u) => ({
        kind: "staff" as const, id: u.id, name: u.name, email: u.email,
        role: u.role, status: u.status, you: !!me && me === u.email,
      })),
    // laboratories
    ...labs.map((l) => ({
      kind: "lab" as const, id: l.id, name: l.name, email: l.email,
      status: l.status, you: !!me && me === l.email,
    })),
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{tr("users.title")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 720 }}>{tr("users.subtitle")}</p>
      <PendingLabApplications apps={pending} />
      <UsersTable rows={rows} authEnabled={ctx.authEnabled} />
    </div>
  );
}
