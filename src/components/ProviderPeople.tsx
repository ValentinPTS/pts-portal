"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/LangProvider";
import { setPermanentRoleAction, assignSchemeRoleAction, endSchemeRoleAction, recordDeclarationAction, voidDeclarationAction } from "@/lib/actions";
import { ROLE_LABEL, SCHEME_ROLES, type SchemeRole } from "@/lib/role-model";

// «Хората на PTS» (plan part 2.2, Реш. 141): each person's permanent role and, from
// the Order, their roles in each scheme. Only the head of the PT provider changes
// them; everyone who opens «Потребители» sees them. The rights of each role are the
// portal's own (lib/role-model.ts, 2.1) — nobody grants a right, only a role.

export type HeldRole = { id: string; schemeId: string; role: SchemeRole; orderRef?: string };
export type PersonView = {
  email: string;
  name: string;
  staffId?: string; // a founder has no team row, so no permanent role to set here
  head: boolean;
  active: boolean;
  you: boolean; // nobody changes their own role (2.2)
  permanentRole: "quality" | "software_admin" | null;
  roles: HeldRole[];
  // Ф 4.2-1 (2.8): the one in force, and how many earlier; the scan opens for the
  // head and the person themselves
  declaration?: { id: string; signedOn: string; earlier: number; canOpen: boolean };
  voidedDeclarations?: number;
  // may a Ф 4.2-1 be recorded for them — one of PTS's people, not the auditor (2.8)
  recordable?: boolean;
};

type Where = "table" | "assign" | "decl";

export default function ProviderPeople({ people, schemes, canManage, today }: { people: PersonView[]; schemes: { id: string; number: string }[]; canManage: boolean; today: string }) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<{ msg: string; where: Where } | null>(null);
  const [person, setPerson] = useState("");
  const [schemeId, setSchemeId] = useState("");
  const [role, setRole] = useState<SchemeRole>("scheme_manager");
  const [orderRef, setOrderRef] = useState("");
  const [declPerson, setDeclPerson] = useState("");
  const [declOn, setDeclOn] = useState("");
  const [declKey, setDeclKey] = useState(0); // a new file field after a save
  const label = (r: keyof typeof ROLE_LABEL) => ROLE_LABEL[r][lang === "en" ? "en" : "bg"];
  const assignable = people.filter((p) => p.active && p.permanentRole !== "software_admin");

  // the answer shows beside what was done; a request that never got an answer (too
  // large for the server, or a session that ran out) says so instead of breaking the page
  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, after?: () => void, where: Where = "table") {
    setErr(null);
    start(async () => {
      try {
        const res = await fn();
        if (res?.error) { setErr({ msg: res.error, where }); return; }
      } catch {
        setErr({ msg: t("decl.notSent"), where });
        return;
      }
      after?.();
      router.refresh();
    });
  }
  const errAt = (where: Where) => err?.where === where && <p className="mt-2" role="alert" style={{ color: "var(--red)", fontSize: 13 }}>{err.msg}</p>;

  function assign(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("email", person);
    fd.set("schemeId", schemeId);
    fd.set("role", role);
    fd.set("orderRef", orderRef);
    run(() => assignSchemeRoleAction(fd), () => { setPerson(""); setOrderRef(""); }, "assign");
  }

  function declare(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (file instanceof File && file.size > 15_000_000) { setErr({ msg: t("decl.tooLarge"), where: "decl" }); return; }
    fd.set("email", declPerson);
    fd.set("signedOn", declOn);
    run(() => recordDeclarationAction(fd), () => { setDeclPerson(""); setDeclOn(""); setDeclKey((k) => k + 1); }, "decl");
  }
  const fmtDay = (d: string) => d.split("-").reverse().join(".");

  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13, background: "#fff" } as const;

  return (
    <section className="mt-7" data-provider-people>
      <h2 className="text-lg font-bold mb-1 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>{t("people.title")}</h2>
      <p className="text-xs mb-2" style={{ color: "var(--muted)", maxWidth: 760 }}>{t(canManage ? "people.hint" : "people.hintReadOnly")}</p>
      {errAt("table")}

      <div className="card overflow-hidden">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
              <th className="text-left p-2">{t("users.col.name")}</th>
              <th className="text-left p-2">{t("people.col.permanent")}</th>
              <th className="text-left p-2">{t("people.col.schemes")}</th>
              {canManage && <th className="text-left p-2">{t("decl.col")}</th>}
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && <tr><td colSpan={canManage ? 4 : 3} className="p-3" style={{ color: "var(--muted)" }}>{t("users.noStaff")}</td></tr>}
            {people.map((p) => (
              <tr key={p.email} data-person={p.email} style={{ borderTop: "1px solid var(--line)", opacity: p.active ? 1 : 0.6 }}>
                <td className="p-2 align-top">
                  <div>{p.name || "—"}</div>
                  <div className="text-xs font-mono" style={{ color: "var(--muted)" }}>{p.email}</div>
                </td>
                <td className="p-2 align-top">
                  <div className="flex flex-col gap-1 items-start">
                    {p.head && (
                      // named in the settings (PROVIDER_HEAD_EMAILS), not here
                      <span data-head title={t("people.headHint")} style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "var(--green-light)", borderRadius: 999, padding: "2px 8px" }}>{label("head")}</span>
                    )}
                    {p.staffId && canManage && !p.you ? (
                      <select data-permanent value={p.permanentRole ?? ""} disabled={pending} style={field}
                        onChange={(e) => run(() => setPermanentRoleAction(p.staffId!, e.target.value))}>
                        <option value="">—</option>
                        <option value="quality">{label("quality")}</option>
                        <option value="software_admin">{label("software_admin")}</option>
                      </select>
                    ) : p.permanentRole ? (
                      <span>{label(p.permanentRole)}</span>
                    ) : !p.head ? <span style={{ color: "var(--muted)" }}>—</span> : null}
                  </div>
                </td>
                <td className="p-2 align-top">
                  {p.roles.length === 0 ? <span style={{ color: "var(--muted)" }}>—</span> : (
                    <ul className="flex flex-col gap-1">
                      {p.roles.map((r) => (
                        <li key={r.id} data-held-role={`${r.schemeId}:${r.role}`} className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs">{schemes.find((s) => s.id === r.schemeId)?.number ?? r.schemeId}</span>
                          <span>{label(r.role)}</span>
                          {r.orderRef && <span className="text-xs" style={{ color: "var(--muted)" }}>· {r.orderRef}</span>}
                          {canManage && (
                            <button className="btn btn-sm" data-end-role disabled={pending} style={{ fontSize: 11, padding: "2px 8px" }}
                              onClick={() => window.confirm(t("people.endConfirm")) && run(() => endSchemeRoleAction(r.id))}>
                              {t("people.end")}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                {canManage && (
                  // the dates of PTS's people's declarations: the head's to keep (2.8)
                  <td className="p-2 align-top" data-declaration={p.declaration ? p.declaration.signedOn : "none"}>
                    {p.declaration ? (
                      <div className="flex flex-col gap-0.5 items-start">
                        <span>{t("decl.signed")} <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDay(p.declaration.signedOn)}</span></span>
                        {p.declaration.canOpen && <a href={`/users/declarations/${p.declaration.id}`} target="_blank" rel="noopener" className="text-xs" data-declaration-scan>{t("decl.scan")}</a>}
                        {p.declaration.earlier > 0 && <span className="text-xs" style={{ color: "var(--muted)" }}>{t("decl.earlier")}: {p.declaration.earlier}</span>}
                        <button className="btn btn-sm" data-void-declaration disabled={pending} style={{ fontSize: 11, padding: "2px 8px" }}
                          onClick={() => { const why = window.prompt(t("decl.voidPrompt")); if (why !== null) run(() => voidDeclarationAction(p.declaration!.id, why)); }}>
                          {t("decl.void")}
                        </button>
                      </div>
                    ) : <span style={{ color: "var(--red)" }}>{t("decl.none")}</span>}
                    {(p.voidedDeclarations ?? 0) > 0 && <div className="text-xs" style={{ color: "var(--muted)" }}>{t("decl.voided")}: {p.voidedDeclarations}</div>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <>
          <h3 className="font-bold mt-5 mb-1" style={{ color: "var(--green-dark)" }}>{t("people.assignTitle")}</h3>
          <p className="text-xs mb-2" style={{ color: "var(--muted)", maxWidth: 760 }}>{t("people.assignHint")}</p>
          <form onSubmit={assign} data-assign-role className="grid gap-3 items-end" style={{ gridTemplateColumns: "1.6fr 1fr 1.6fr 1.6fr auto" }}>
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("people.person")}</span>
              <select value={person} onChange={(e) => setPerson(e.target.value)} required className="w-full" style={field}>
                <option value="" />
                {assignable.map((p) => <option key={p.email} value={p.email}>{p.name ? `${p.name} · ${p.email}` : p.email}</option>)}
              </select></label>
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("people.scheme")}</span>
              <select value={schemeId} onChange={(e) => setSchemeId(e.target.value)} required className="w-full" style={field}>
                <option value="" />
                {schemes.map((s) => <option key={s.id} value={s.id}>{s.number}</option>)}
              </select></label>
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("people.role")}</span>
              <select value={role} onChange={(e) => setRole(e.target.value as SchemeRole)} className="w-full" style={field}>
                {SCHEME_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
              </select></label>
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("people.order")}</span>
              <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} required maxLength={120} placeholder={t("people.orderPlaceholder")}
                className="w-full rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--line)", background: "#fff" }} /></label>
            <button type="submit" className="btn btn-primary" disabled={pending}>{t("people.assign")}</button>
          </form>
          {errAt("assign")}

          <h3 className="font-bold mt-6 mb-1" style={{ color: "var(--green-dark)" }}>{t("decl.title")}</h3>
          <p className="text-xs mb-2" style={{ color: "var(--muted)", maxWidth: 760 }}>{t("decl.hint")}</p>
          <form onSubmit={declare} data-record-declaration className="grid gap-3 items-end" style={{ gridTemplateColumns: "1.6fr 1fr 1.8fr auto" }}>
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("people.person")}</span>
              <select value={declPerson} onChange={(e) => setDeclPerson(e.target.value)} required className="w-full" style={field}>
                <option value="" />
                {people.filter((p) => p.recordable).map((p) => <option key={p.email} value={p.email}>{p.name ? `${p.name} · ${p.email}` : p.email}</option>)}
              </select></label>
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("decl.date")}</span>
              <input type="date" value={declOn} max={today} min="2000-01-01" onChange={(e) => setDeclOn(e.target.value)} required className="w-full" style={field} /></label>
            <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("decl.file")}</span>
              <input key={declKey} type="file" name="file" accept="application/pdf,image/png,image/jpeg" required className="w-full text-sm" /></label>
            <button type="submit" className="btn btn-primary" disabled={pending}>{t("decl.record")}</button>
          </form>
          {errAt("decl")}
        </>
      )}
    </section>
  );
}
