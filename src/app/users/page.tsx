import { listStaff } from "@/lib/staff";
import { listLabs } from "@/lib/labs";
import { ownerEmails } from "@/lib/auth";
import { requireManager, getRoleContext } from "@/lib/roles";
import { getServerT } from "@/lib/i18n-server";
import UsersTable, { type UserRow } from "@/components/UsersTable";

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

  const [staff, labs] = await Promise.all([listStaff(), listLabs()]);
  const founders = ownerEmails();
  const founderSet = new Set(founders);

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
      <UsersTable rows={rows} authEnabled={ctx.authEnabled} />
    </div>
  );
}
