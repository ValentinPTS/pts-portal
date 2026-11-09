import Link from "next/link";
import { mayNow, getViewer, authorize, schemesFor } from "@/lib/access";
import { listSchemeRoles } from "@/lib/scheme-roles";
import { listDesignations } from "@/lib/processing-roles";
import { canManagePeople } from "@/lib/roles";
import { requireStaff, getRoleContext } from "@/lib/roles";
import { getServerT } from "@/lib/i18n-server";
import { listChanges, type ChangeEntry } from "@/lib/change-register";
import { proposeChangeAction, decideChangeAction } from "@/lib/actions";
import { isEffectiveHead } from "@/lib/people-manager";

// «Регистър на промените» (plan part 1.11; ISO/IEC 17043 §7.5.2, Реш. 67, rule 7).
// Every release, every update of a dependency or the platform, and every change of a
// system setting: what changed, who authorised it, how it was validated — before it
// was put to use. Read by everyone at PTS (the auditor included); a manager proposes
// a release or an update; the head of the PT provider authorises or rejects it. A
// setting changed in the portal (an approved reminder text, a person's role) is
// recorded by itself, with who made it.
export const dynamic = "force-dynamic";

function fmt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export default async function ChangesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff();
  const ctx = await getRoleContext();
  // proposing: the software administrator; authorising: the head (1.11, the role model 2.4)
  const isManager = await mayNow("register.propose");
  const canDecide = (await mayNow("register.authorise")) && (!ctx.authEnabled || (await isEffectiveHead(ctx.email)));
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const sp = await searchParams;
  // A scheme's roles and its three processing acts are what its Order assigns
  // (Реш. 149, 2.6): such an entry is shown to one who reads that scheme's journal or
  // its Order — as the journal and «Потребители» show it — or manages PTS's people.
  // Everything else in the register is everyone's at PTS.
  const viewer = await getViewer();
  const peopleManager = await canManagePeople(ctx);
  const [roles, designations] = await Promise.all([listSchemeRoles({ all: true }), listDesignations({ all: true })]);
  const schemeOf = new Map<string, string>([...roles.map((r) => [`scheme_role:${r.id}`, r.schemeId] as const), ...designations.map((d) => [`processing:${d.id}`, d.schemeId] as const)]);
  const seesScheme = (schemeId: string) => peopleManager || authorize(viewer, "journal.read", schemeId) || authorize(viewer, "order.view", schemeId);
  // roles ended on a deactivation (or on becoming the auditor) name several schemes
  const seesAll = peopleManager || schemesFor(viewer, "journal.read") === "all";
  const shown = (e: ChangeEntry) => {
    const scheme = e.ref ? schemeOf.get(e.ref) : undefined;
    if (scheme) return seesScheme(scheme);
    if (e.ref && /^(scheme_role|processing):/.test(e.ref)) return peopleManager; // its record not found: closed
    if (/^Роли в схеми на /.test(e.title)) return seesAll;
    return true;
  };
  const entries = (await listChanges(300)).filter(shown);
  const running = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12);

  const KIND: Record<ChangeEntry["kind"], string> = { release: L("версия", "release"), update: L("обновяване", "update"), setting: L("настройка", "setting") };
  const STATUS: Record<ChangeEntry["status"], [string, string, string]> = {
    proposed: [L("предложена", "proposed"), "#fbe9dc", "#7a2e0e"],
    authorised: [L("разрешена", "authorised"), "#e3eeda", "#456b2c"],
    deployed: [L("в употреба", "in use"), "#dfe9f3", "#2b4a6b"],
    rejected: [L("отхвърлена", "rejected"), "#eef1ee", "#666"],
  };
  const ERR: Record<string, string> = {
    title: L("Дайте кратко заглавие.", "Give a short title."), what: L("Опишете какво се променя.", "Describe what changes."),
    validation: L("Опишете как е проверено.", "Describe how it was validated."), commit: L("За версия: целият commit, 40 знака (git rev-parse HEAD).", "For a release: the whole commit, 40 characters (git rev-parse HEAD)."),
    self: L("Който е предложил промяната, не може да я разреши — нужен е друг човек.", "Whoever proposed a change cannot authorise it — it takes another person."),
    login: L("На сайта регистърът работи само с включен вход.", "On the site the register works only with sign-in on."),
    kind: L("Изберете вид.", "Choose a kind."), head: L("Само ръководителят на РТ провайдъра разрешава.", "Only the head of the PT provider authorises."),
    changed: L("Записът вече не е «предложен» — презаредете.", "The entry is no longer «proposed» — reload."), bad: L("Невалидна заявка.", "Not a valid request."),
  };
  const field = { border: "1px solid var(--line)", borderRadius: 6, padding: 6, fontSize: 13 } as const;

  return (
    <div className="max-w-5xl">
      <Link href="/system" className="text-sm" style={{ color: "var(--muted)" }}>← {L("Проверка на системата", "System check")}</Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>{L("Регистър на промените", "Change register")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 780 }}>
        {L("Всяка промяна на системата се разрешава, документира и проверява, преди да влезе в употреба (Реш. 67): нова версия на портала, обновяване на библиотека или платформа, промяна на настройка. Сайтът качва нова версия само ако в регистъра има разрешение за точно нея.",
          "Every change of the system is authorised, documented and validated before it is put to use (Decision 67): a new release, an update of a library or the platform, a change of a setting. The site deploys a new release only if the register authorises exactly that one.")}
        {running && <> {L("Сега работи", "Running now")}: <span className="font-mono">{running}</span>.</>}
      </p>
      {sp.error && <p role="alert" className="text-sm mt-3" style={{ color: "var(--red)" }}>{ERR[sp.error] ?? ERR.bad}</p>}
      {(sp.proposed || sp.authorised || sp.rejected) && <p role="status" className="text-sm mt-3" style={{ color: "var(--green-dark)" }}>{sp.proposed ? L("Предложено. Чака разрешение от ръководителя.", "Proposed. It awaits the head's authorisation.") : sp.authorised ? L("Разрешено.", "Authorised.") : L("Отхвърлено.", "Rejected.")}</p>}

      {isManager && (
        <details className="card p-3 mt-4" data-propose>
          <summary className="font-bold text-sm" style={{ color: "var(--green-dark)", cursor: "pointer" }}>{L("Предложи промяна", "Propose a change")}</summary>
          <form action={proposeChangeAction} className="grid gap-2 mt-3">
            <label className="text-xs">{L("Вид", "Kind")}
              <select name="kind" defaultValue="release" style={field}>
                <option value="release">{L("Нова версия на портала (commit)", "A new release of the portal (commit)")}</option>
                <option value="update">{L("Обновяване на библиотека или платформа", "An update of a library or the platform")}</option>
              </select>
            </label>
            <label className="text-xs">{L("Заглавие", "Title")}<input name="title" maxLength={200} className="w-full" style={field} /></label>
            <label className="text-xs">{L("Какво се променя", "What changes")}<textarea name="what" rows={3} maxLength={5000} className="w-full" style={field} /></label>
            <label className="text-xs">{L("Как е проверено", "How it was validated")}<textarea name="validation" rows={3} maxLength={5000} className="w-full" style={field} placeholder={L("напр. типове, lint, N набора тестове, build; проверки в браузъра; тестовата среда; независим преглед", "e.g. types, lint, N test suites, build; browser checks; the test environment; an independent review")} /></label>
            <label className="text-xs">{L("Commit (за версия)", "Commit (for a release)")}<input name="ref" maxLength={40} minLength={40} className="w-full font-mono" style={field} placeholder="git rev-parse HEAD — 40 знака" /></label>
            <div><button type="submit" className="btn btn-primary btn-sm">{L("Предложи", "Propose")}</button></div>
          </form>
        </details>
      )}

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm" data-changes style={{ borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "var(--green-soft)", color: "var(--green-dark)", textAlign: "left" }}>
            <th className="p-2">{L("Кога", "When")}</th><th className="p-2">{L("Вид", "Kind")}</th><th className="p-2">{L("Промяна", "Change")}</th>
            <th className="p-2">{L("Разрешил", "Authorised by")}</th><th className="p-2">{L("Състояние", "Status")}</th>
          </tr></thead>
          <tbody>
            {entries.length === 0 && <tr><td colSpan={5} className="p-3" style={{ color: "var(--muted)" }}>{L("Още няма записи.", "No entries yet.")}</td></tr>}
            {entries.map((e) => {
              const [label, bg, fg] = STATUS[e.status];
              return (
                <tr key={e.id} data-change-entry={e.status} style={{ borderTop: "1px solid var(--line)", verticalAlign: "top" }}>
                  <td className="p-2" style={{ whiteSpace: "nowrap" }}>{fmt(e.createdAt)}</td>
                  <td className="p-2">{KIND[e.kind]}{e.ref && <div className="font-mono text-xs" style={{ color: "var(--muted)" }}>{e.ref}</div>}</td>
                  <td className="p-2">
                    <b>{e.title}</b>
                    <div className="text-xs mt-1" style={{ whiteSpace: "pre-wrap" }}>{e.what}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--muted)", whiteSpace: "pre-wrap" }}>{L("Проверено", "Validated")}: {e.validation}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{L("Предложил", "Proposed by")}: {e.requestedBy}</div>
                    {e.reason && <div className="text-xs mt-1">{L("Причина", "Reason")}: {e.reason}</div>}
                  </td>
                  <td className="p-2 text-xs">{e.authorisedBy ? <>{e.authorisedBy}<div style={{ color: "var(--muted)" }}>{fmt(e.authorisedAt)}</div></> : e.rejectedBy ? <>{e.rejectedBy}<div style={{ color: "var(--muted)" }}>{fmt(e.rejectedAt)}</div></> : "—"}</td>
                  <td className="p-2">
                    <span className="text-xs font-bold rounded px-2 py-0.5" style={{ background: bg, color: fg }}>{label}</span>
                    {e.deployedAt && <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{fmt(e.deployedAt)}</div>}
                    {canDecide && e.status === "proposed" && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        <form action={decideChangeAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="authorise" />
                          <button type="submit" data-authorise className="btn btn-primary btn-sm" style={{ fontSize: 12 }}>{L("Разреши", "Authorise")}</button></form>
                        <form action={decideChangeAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="reject" />
                          <input name="reason" placeholder={L("причина", "reason")} style={{ ...field, width: 110 }} />
                          <button type="submit" className="btn btn-sm" style={{ fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }}>{L("Отхвърли", "Reject")}</button></form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
