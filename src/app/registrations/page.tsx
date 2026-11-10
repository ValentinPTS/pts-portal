import Link from "next/link";
import { requireSection } from "@/lib/access";
import { getServerT } from "@/lib/i18n-server";
import { actorNow } from "@/lib/identities";
import { listLabApplications } from "@/lib/lab-applications";
import { openEntities } from "@/lib/entities";
import { openEntityUsers } from "@/lib/entity-users";
import { STATE_LABEL } from "@/lib/entities-model";
import { confirmDate } from "@/lib/profile-confirm-model";
import { keptUntil, retentionOver } from "@/lib/retention-model";
import { schemeNowMs } from "@/lib/clock";
import RegistrationDecision from "@/components/RegistrationDecision";
import RejectedRegistrations from "@/components/RejectedRegistrations";
import type { LabApplication } from "@/lib/types";

// «Одобрения на регистрации» (plan part 9.1; the admin panel's section, labs.manage): the registrations of
// organisations waiting — approve (the entity «чака проверка», its first laboratory, its administrator
// «поканен») or refuse with the reason (kept six years, 4.7); the requests to join an existing entity —
// the entity's administrator decides them in the laboratory's portal; PTS only as the fallback (no active
// administrator, or the entity's signed letter). The papers open through the gate of «Потребители».
export const dynamic = "force-dynamic";

// what a decision did — said by the page, since the decided request leaves the list
const DONE: Record<string, { bg: string; en: string }> = {
  "approved-sent": { bg: "Одобрена: профилът е създаден («чака проверка»); поканете администратора от «Организации». Уведомлението до официалния e-mail тръгна.", en: "Approved: the profile is made («awaiting the check»); invite its administrator from «Organisations». The notice to the official e-mail went." },
  "approved-not-sent": { bg: "Одобрена: профилът е създаден («чака проверка»); поканете администратора от «Организации». Уведомлението до официалния e-mail НЕ тръгна — записано е; изпратете го отново от «Организации».", en: "Approved: the profile is made («awaiting the check»); invite its administrator from «Organisations». The notice to the official e-mail did NOT go — it is on record; send it again from «Organisations»." },
  "became-join": { bg: "ЕИК вече е на организация — регистрацията стана заявка за присъединяване към нея.", en: "The ЕИК is an organisation's now — the registration became a request to join it." },
  "joined-sent": { bg: "Одобрена от PTS: лицето е потребител («поканен») — поканете го от «Организации». Уведомлението до официалния e-mail тръгна.", en: "Approved by PTS: the person is a user («invited») — invite them from «Organisations». The notice to the official e-mail went." },
  "joined-not-sent": { bg: "Одобрена от PTS: лицето е потребител («поканен») — поканете го от «Организации». Уведомлението до официалния e-mail НЕ тръгна — записано е; изпратете го отново от «Организации».", en: "Approved by PTS: the person is a user («invited») — invite them from «Organisations». The notice to the official e-mail did NOT go — it is on record; send it again from «Organisations»." },
  "joined-admin-sent": { bg: "Одобрена от PTS: профилът нямаше администратор — лицето е негов администратор («поканен») — поканете го от «Организации». Уведомленията до официалния e-mail тръгнаха.", en: "Approved by PTS: the profile had no administrator — the person is its administrator («invited») — invite them from «Organisations». The notices to the official e-mail went." },
  "joined-admin-not-sent": { bg: "Одобрена от PTS: профилът нямаше администратор — лицето е негов администратор («поканен») — поканете го от «Организации». Уведомленията до официалния e-mail НЕ тръгнаха — записани са; изпратете ги отново от «Организации».", en: "Approved by PTS: the profile had no administrator — the person is its administrator («invited») — invite them from «Organisations». The notices to the official e-mail did NOT go — on record; send them again from «Organisations»." },
  refused: { bg: "Отказана — пази се с причината 6 години.", en: "Refused — kept with its reason for 6 years." },
};

export default async function RegistrationsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  await requireSection("registrations");
  const done = DONE[(await searchParams).done ?? ""];
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const actor = await actorNow();
  const [pending, rejectedApps, approvedApps] = await Promise.all([listLabApplications("pending"), listLabApplications("rejected"), listLabApplications("approved")]);
  // the joins PTS decided on a signed letter — the letter kept, opened through its gate
  const byLetter = approvedApps.filter((a) => a.kind === "join" && a.decidedAs === "pts" && a.letterPath);
  const regs = pending.filter((a) => a.kind === "entity");
  const joins = pending.filter((a) => a.kind === "join" && a.entityId);
  // the entities asked to be joined, and whether each has an active administrator — opened on record
  const ids = [...new Set(joins.map((j) => j.entityId!))];
  const ents = new Map((await Promise.all(ids.map((id) => openEntities({ actor, purpose: "names.view" }, id)))).flat().map((e) => [e.id, e]));
  const admins = new Map(await Promise.all(ids.map(async (id) => [id, (await openEntityUsers({ actor, purpose: "names.view" }, { entityId: id })).some((u) => u.role === "admin" && u.state === "active")] as const)));
  // the people let in by a registration or a join whose invitation has not gone yet — PTS invites them
  // from «Организации» (the profile's administrator's invitation may not have gone): the entities of the
  // approved registrations and joins, opened on record
  const approvedIds = new Set(approvedApps.filter((a) => (a.kind === "entity" || a.kind === "join") && a.entityId).map((a) => a.entityId!));
  const waitingInvite = approvedIds.size ? (await openEntityUsers({ actor, purpose: "names.view" })).filter((u) => approvedIds.has(u.entityId) && u.state === "invited" && !u.authUserId) : [];
  const nowMs = schemeNowMs(); // the real clock
  const rejected = rejectedApps.map((a) => ({ id: a.id, orgName: a.orgName || a.email, reason: a.rejectReason ?? "", rejectedAt: a.reviewedAt ?? "", keptUntil: keptUntil(a.reviewedAt), over: retentionOver(a, nowMs) }));

  const row = (label: string, value?: string) => value ? <div><div style={{ fontSize: 11, color: "var(--muted)" }}>{label}</div><div style={{ fontSize: 13 }}>{value}</div></div> : null;
  const grid = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" } as const;
  const checks = (a: LabApplication) => [
    a.country === "BG" ? L(`ЕИК: ${a.eikValid ? "контролната цифра е вярна" : "непроверен"}`, `ЕИК: ${a.eikValid ? "check digit correct" : "not checked"}`) : "",
    a.vat ? `VIES: ${a.vatStatus ?? L("непроверен", "not checked")}${a.vatName ? ` — ${a.vatName}` : ""}` : "",
    a.region === "non_eu" ? L(`извън ЕС — документи: ${a.docPaths.length}`, `outside the EU — documents: ${a.docPaths.length}`) : "",
  ].filter(Boolean).join(" · ");
  const docs = (a: LabApplication) => a.docPaths.length ? (
    <div className="text-xs mt-1">{a.docPaths.map((_, i) => <a key={i} href={`/users/applications/${a.id}/${i}`} target="_blank" rel="noreferrer" style={{ marginRight: 10, textDecoration: "underline" }}>{L(`документ ${i + 1}`, `document ${i + 1}`)}</a>)}</div>
  ) : null;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Одобрения на регистрации", "Registration approvals")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 780 }}>
        {L("Регистрациите от портала — организацията, първата ѝ лаборатория и администраторът на профила. Одобрената става юридическо лице «чака проверка» в «Организации»; поканата до администратора се изпраща оттам. ЕИК, който вече е на организация, прави заявката заявка за присъединяване: решава я администраторът на профила, а PTS — само ако няма активен администратор или по подписаното писмо на организацията. Отказаната се пази 6 години с причината.",
           "The registrations from the portal — the organisation, its first laboratory and the profile's administrator. An approved one becomes a legal entity «awaiting the check» in «Organisations»; the invitation to the administrator is sent from there. An ЕИК that is already an organisation's makes the request a request to join: the profile's administrator decides it, PTS only when there is no active administrator or on the organisation's signed letter. A refused one is kept 6 years with its reason.")}
      </p>

      {done && <div role="status" data-registrations-done className="card p-3 mt-3 text-sm" style={{ background: "var(--green-soft)" }}>{L(done.bg, done.en)}</div>}

      <h2 className="font-bold mt-5" style={{ color: "var(--green-dark)" }}>{L("Регистрации на организации", "Registrations of organisations")} ({regs.length})</h2>
      {regs.length === 0 && <p className="text-sm mt-1" data-registrations-none style={{ color: "var(--muted)" }}>{L("Няма чакащи регистрации.", "No registrations waiting.")}</p>}
      <div className="grid gap-3 mt-2">
        {regs.map((a) => (
          <section key={a.id} className="card p-4" data-registration={a.id}>
            <div className="flex gap-3 items-baseline" style={{ flexWrap: "wrap" }}>
              <b style={{ color: "var(--green-dark)" }}>{a.orgName}</b>
              <span className="text-xs" style={{ color: "var(--muted)" }}>{a.country} · {a.eik} · {L("получена", "received")} {confirmDate(a.createdAt)}</span>
            </div>
            <div className="text-xs mt-1" data-registration-checks style={{ color: "var(--muted)" }}>{checks(a)}</div>
            <div className="mt-2" style={grid}>
              {row(L("Адрес за кореспонденция", "Address for correspondence"), a.address)}
              {row(L("Официален e-mail", "Official e-mail"), a.officialEmail)}
              {row(L("ДДС", "VAT"), a.vat)}
              {row("МОЛ", a.mol)}
              {row(L("Език", "Language"), a.language === "en" ? "English" : "Български")}
            </div>
            <div className="mt-2" style={grid} data-registration-laboratory>
              {row(L("Лаборатория", "Laboratory"), a.labName)}
              {row(L("Адрес за доставка", "Delivery address"), a.deliveryAddress)}
              {row(L("Акредитация", "Accreditation"), [a.accreditationBody, a.accreditationNo].filter(Boolean).join(" · "))}
            </div>
            <div className="mt-2" style={grid} data-registration-person>
              {row(L("Администратор на профила", "Profile administrator"), a.contactPerson)}
              {row(L("E-mail за вход", "Login e-mail"), a.email)}
              {row(L("Длъжност", "Position"), a.position)}
              {row(L("Телефон", "Phone"), a.phone)}
            </div>
            {docs(a)}
            <RegistrationDecision lang={lg} id={a.id} kind="entity" />
          </section>
        ))}
      </div>

      <h2 className="font-bold mt-6" style={{ color: "var(--green-dark)" }}>{L("Заявки за присъединяване", "Requests to join")} ({joins.length})</h2>
      {joins.length === 0 && <p className="text-sm mt-1" data-joins-none style={{ color: "var(--muted)" }}>{L("Няма чакащи заявки.", "No requests waiting.")}</p>}
      <div className="grid gap-3 mt-2">
        {joins.map((a) => {
          const e = ents.get(a.entityId!);
          const hasAdmin = admins.get(a.entityId!) ?? false;
          const closed = !e || e.state === "inactive" || !!e.erasedAt;
          return (
            <section key={a.id} className="card p-4" data-join={a.id} data-join-has-admin={hasAdmin ? "1" : "0"}>
              <div className="flex gap-3 items-baseline" style={{ flexWrap: "wrap" }}>
                <b>{a.contactPerson}</b><span className="text-sm">{a.email}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{L("към", "to")} <Link href={`/organizations?entity=${a.entityId}`} style={{ textDecoration: "underline" }}>{e?.name ?? a.orgName}</Link>{e ? ` · ${L(STATE_LABEL[e.state].bg, STATE_LABEL[e.state].en)}` : ""} · {L("получена", "received")} {confirmDate(a.createdAt)}</span>
              </div>
              <div className="mt-2" style={grid}>
                {row(L("Длъжност", "Position"), a.position)}
                {row(L("Телефон", "Phone"), a.phone)}
                {row(L("Лабораторията, която посочи", "The laboratory they named"), a.labName)}
                {row(L("Официалният e-mail, който посочи", "The official e-mail they named"), a.officialEmail)}
              </div>
              <p className="text-xs mt-2" data-join-who style={{ color: hasAdmin && !closed ? "var(--muted)" : "#7a2e0e" }}>
                {closed
                  ? L("Организацията е неактивна — заявката може само да се откаже.", "The organisation is inactive — the request can only be refused.")
                  : hasAdmin
                    ? L("Профилът има активен администратор — той решава заявката в портала на лабораторията. PTS я решава само с подписаното писмо на организацията.", "The profile has an active administrator — they decide the request in the laboratory's portal. PTS decides it only on the organisation's signed letter.")
                    : L("Профилът няма активен администратор — PTS решава заявката с подписаното писмо на организацията; лицето става администратор на профила.", "The profile has no active administrator — PTS decides the request on the organisation's signed letter; the person becomes the profile's administrator.")}
              </p>
              {docs(a)}
              <RegistrationDecision lang={lg} id={a.id} kind="join" canApprove={!closed} />
            </section>
          );
        })}
      </div>

      {waitingInvite.length > 0 && (
        <section className="card p-4 mt-4" data-waiting-invite>
          <div className="text-sm font-bold" style={{ color: "var(--green-dark)" }}>{L("Чакат покана", "Waiting for the invitation")} ({waitingInvite.length})</div>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{L("Пуснати с регистрация или присъединяване, още без вход — поканете ги от «Организации».", "Let in by a registration or a join, still without a sign-in — invite them from «Organisations».")}</p>
          <ul className="text-sm mt-2" style={{ display: "grid", gap: 4 }}>
            {waitingInvite.map((u) => <li key={u.id} data-waiting-user={u.id}>{u.name} · {u.email} · <Link href={`/organizations?entity=${u.entityId}`} style={{ textDecoration: "underline" }}>{L("към организацията", "to the organisation")}</Link></li>)}
          </ul>
        </section>
      )}

      {byLetter.length > 0 && (
        <details className="card p-4 mt-4" data-join-letters>
          <summary className="text-sm font-bold" style={{ cursor: "pointer", color: "var(--green-dark)" }}>{L("Присъединявания, решени от PTS по писмо", "Joins decided by PTS on a letter")} ({byLetter.length})</summary>
          <ul className="text-sm mt-2" style={{ display: "grid", gap: 4 }}>
            {byLetter.map((a) => <li key={a.id}>{a.contactPerson} · {a.reviewedAt ? confirmDate(a.reviewedAt) : ""} · <a href={`/registrations/letter/${a.id}`} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>{L("писмото", "the letter")}</a></li>)}
          </ul>
        </details>
      )}

      <RejectedRegistrations lang={lg} rows={rejected} />
    </div>
  );
}
