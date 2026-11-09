import Link from "next/link";
import { listStaff } from "@/lib/staff";
import { listLabs } from "@/lib/labs";
import { listLabApplications } from "@/lib/lab-applications";
import { ownerEmails } from "@/lib/auth";
import { isProviderHead, isSharedMailbox, providerHeadEmails } from "@/lib/provider-people";
import { listSchemeRoles } from "@/lib/scheme-roles";
import { listDeclarations } from "@/lib/staff-declarations";
import { sofiaDay } from "@/lib/chain";
import { listSchemeSummaries } from "@/lib/store";
import { invitePreview } from "@/lib/fixed-texts";
import { testSubject } from "@/lib/environment";
import { requirePeopleManager, getRoleContext, canManagePeople } from "@/lib/roles";
import { requireCapAnywhere, mayAnywhereNow, mayNow, getViewer, authorize } from "@/lib/access";
import { isEffectiveHead } from "@/lib/people-manager";
import { getServerT } from "@/lib/i18n-server";
import UsersTable, { type UserRow } from "@/components/UsersTable";
import PendingLabApplications, { type PendingAppView } from "@/components/PendingLabApplications";
import RejectedRegistrations from "@/components/RejectedRegistrations";
import { keptUntil, retentionOver } from "@/lib/retention-model";
import { schemeNowMs } from "@/lib/clock";
import ProviderPeople, { type PersonView, type HeldRole } from "@/components/ProviderPeople";

// Manager-only "Users & roles" screen (Phase RT1). Lists internal staff (editable
// role + active/inactive), founders from OWNER_EMAILS (always Manager, read-only),
// and laboratory accounts (active/inactive). Filter All / Staff / Labs is handled
// client-side in UsersTable. Gated by the role model (2.4): who manages laboratory accounts —
// or the head of the PT provider, who manages PTS's own people (part 2.2, Реш. 141)
// and sees no laboratory here unless also a manager (D5: no names without a role).
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const ctx = await getRoleContext();
  const peopleManager = await canManagePeople(ctx);
  // either gate also sends a temporary password to be changed first, and asks for 2FA
  if (peopleManager) await requirePeopleManager();
  else await requireCapAnywhere("labs.manage");
  // the laboratory accounts and applications: names — who works with them (2.4, Реш. 93)
  const manager = await mayAnywhereNow("labs.manage");
  const { tr, lang } = await getServerT();
  const me = ctx.email;

  const [staff, labs, pendingApps, held, schemes, rejectedApps] = await Promise.all([
    listStaff(), manager ? listLabs() : Promise.resolve([]), manager ? listLabApplications("pending") : Promise.resolve([]),
    listSchemeRoles(), listSchemeSummaries(), manager ? listLabApplications("rejected") : Promise.resolve([]),
  ]);
  // the rejected ones, kept six years with their reason (4.7, Zadanie §10)
  const nowMs = schemeNowMs(); // the real clock (no scheme's test clock)
  const rejected = rejectedApps.map((a) => ({ id: a.id, orgName: a.orgName || a.email, reason: a.rejectReason ?? "", rejectedAt: a.reviewedAt ?? "", keptUntil: keptUntil(a.reviewedAt), over: retentionOver(a, nowMs) }));
  // Ф 4.2-1 (2.8) — the head's to keep: the one in force per person (newest first, not
  // voided), how many before it, how many voided. Nobody else gets the dates.
  const declarations = peopleManager ? await listDeclarations() : [];
  const declarationOf = (email: string): Pick<PersonView, "declaration" | "voidedDeclarations"> => {
    const mine = declarations.filter((d) => d.personEmail === email.toLowerCase());
    const valid = mine.filter((d) => !d.voided);
    return {
      declaration: valid[0] ? { id: valid[0].id, signedOn: valid[0].signedOn, earlier: valid.length - 1, canOpen: true } : undefined,
      voidedDeclarations: mine.length - valid.length,
    };
  };
  // a shared address left in OWNER_EMAILS is nobody (Реш. 139; the system check flags it)
  const founders = ownerEmails().filter((e) => !isSharedMailbox(e));
  const founderSet = new Set(founders);

  // The review view for pending applications. Their documents open through a gate
  // of this portal (/users/applications/<id>/<n>), never a signed link to the
  // private bucket — so every opening is in the journal (part 1.9).
  const pending: PendingAppView[] = await Promise.all(
    pendingApps.map(async (a) => {
      const docs: { name: string; url: string }[] = a.docPaths.map((path, i) => ({
        name: path.split("/").pop() ?? "document",
        url: `/users/applications/${encodeURIComponent(a.id)}/${i}`,
      }));
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

  // PTS's own people and their roles (2.1, 2.2): the heads, the founders, the team.
  // A scheme's roles are what its Order assigns: one who manages the laboratory
  // accounts but not PTS's people sees them only where they may read that Order
  // (Реш. 149, 2.6)
  const viewer = await getViewer();
  const shown = peopleManager ? held : held.filter((r) => authorize(viewer, "order.view", r.schemeId));
  const rolesOf = (email: string): HeldRole[] =>
    shown.filter((r) => r.personEmail === email.toLowerCase()).map((r) => ({ id: r.id, schemeId: r.schemeId, role: r.role, orderRef: r.orderRef }));
  const staffSet = new Set(staff.map((u) => u.email.toLowerCase()));
  const you = (email: string) => !!me && me === email;
  const people: PersonView[] = [
    ...providerHeadEmails().filter((e) => !founderSet.has(e) && !staffSet.has(e))
      .map((email) => ({ email, name: "", head: true, active: true, you: you(email), permanentRole: null, roles: rolesOf(email) })),
    ...founders.map((email) => ({ email, name: "", head: isProviderHead(email), active: true, you: you(email), permanentRole: null, roles: rolesOf(email) })),
    ...staff.filter((u) => !founderSet.has(u.email)).map((u) => ({
      email: u.email, name: u.name, staffId: u.id, head: isProviderHead(u.email), active: u.status === "active", you: you(u.email),
      permanentRole: u.permanentRole ?? null, roles: rolesOf(u.email),
    })),
  ].sort((a, b) => Number(b.head) - Number(a.head));
  const auditors = new Set(staff.filter((u) => u.role === "auditor").map((u) => u.email.toLowerCase()));
  for (const p of people) Object.assign(p, declarationOf(p.email), { recordable: p.active && !auditors.has(p.email.toLowerCase()) });
  // a role still held by someone no longer listed (e.g. taken out of PROVIDER_HEAD_EMAILS)
  // stays visible, so it can be ended
  const listed = new Set(people.map((p) => p.email));
  for (const email of [...new Set(shown.map((r) => r.personEmail))].filter((e) => !listed.has(e))) {
    people.push({ email, name: "", head: false, active: false, you: you(email), permanentRole: null, roles: rolesOf(email) });
  }

  return (
    <div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{tr("users.title")}</h1>
        {/* the manager-only system check (part 1.1) */}
        <Link href="/system" className="text-sm ml-auto" style={{ color: "var(--green-dark)" }}>{tr("users.systemCheck")} →</Link>
      </div>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 720 }}>{tr("users.subtitle")}</p>
      {manager && <PendingLabApplications apps={pending} />}
      {manager && <RejectedRegistrations lang={lang === "bg" ? "bg" : "en"} rows={rejected} />}
      {/* the 2FA reset is the head of the PT provider's alone (Реш. 95) */}
      <UsersTable rows={rows} authEnabled={ctx.authEnabled} canReset2fa={ctx.authEnabled && (await mayNow("twofa.reset")) && (await isEffectiveHead(me))}
        canManagePeople={peopleManager} canManageLabs={manager}
        invite={(({ subject, body, key }) => ({ subject: testSubject(subject), body, key }))(invitePreview())} />
      {/* the scheme numbers: for the held roles shown, and the assign form — the head's */}
      <ProviderPeople people={people} schemes={schemes.filter((s) => peopleManager || shown.some((r) => r.schemeId === s.id)).map((s) => ({ id: s.id, number: s.number }))} canManage={peopleManager} today={sofiaDay(new Date().toISOString())} />
    </div>
  );
}
