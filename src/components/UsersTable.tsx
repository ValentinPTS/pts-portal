"use client";

import { useState, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/LangProvider";
import {
  setStaffRoleAction, setStaffStatusAction, setLabStatusAction, addStaffAction,
  inviteStaffAction, inviteLabByIdAction, addLabAction, resetTwoFactorAction,
} from "@/lib/actions";
import type { StaffRole, StaffStatus, LabStatus } from "@/lib/types";

// A row is one of: an internal staff user (editable role + status), a founder
// (OWNER_EMAILS — always manager, read-only), or a laboratory (status only).
export type UserRow =
  | { kind: "staff"; id: string; name: string; email: string; role: StaffRole; status: StaffStatus; you?: boolean }
  | { kind: "founder"; email: string; you?: boolean }
  | { kind: "lab"; id: string; name: string; email: string; status: LabStatus; you?: boolean };

type Filter = "all" | "staff" | "labs";
const STAFF_ROLES: StaffRole[] = ["manager", "staff", "auditor"];

// The invitation to a laboratory is shown in full before «Изпрати» (part 1.8, Реш.
// 138); its key goes back with the click, so the server sends that text or nothing.
export type InvitePreview = { subject: string; body: string; key: string };

// PTS's own people are the head's to manage (part 2.2, Реш. 141); laboratories stay
// a manager's. A control nobody here may use is not shown.
export default function UsersTable({ rows, authEnabled, canReset2fa = false, canManagePeople = true, canManageLabs = true, invite }: { rows: UserRow[]; authEnabled: boolean; canReset2fa?: boolean; canManagePeople?: boolean; canManageLabs?: boolean; invite: InvitePreview }) {
  const { t } = useLang();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [said, setSaid] = useState("");
  const [previewFor, setPreviewFor] = useState<string | null>(null); // the lab whose invitation is open
  // add-staff form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("staff");
  // add-lab form
  const [labEmail, setLabEmail] = useState("");
  const [labName, setLabName] = useState("");

  const isStaffRow = (r: UserRow) => r.kind === "staff" || r.kind === "founder";
  const shown = rows.filter((r) =>
    filter === "all" ? true : filter === "staff" ? isStaffRow(r) : r.kind === "lab"
  );

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>) {
    setErr("");
    start(async () => {
      const res = await fn();
      if (res?.error) setErr(res.error);
      else router.refresh();
    });
  }

  function addStaff(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("email", email);
    fd.set("name", name);
    fd.set("role", role);
    start(async () => {
      const res = await addStaffAction(fd);
      if (res?.error) { setErr(res.error); return; }
      setErr(""); setEmail(""); setName(""); setRole("staff");
      router.refresh();
    });
  }

  function addLab(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("email", labEmail);
    fd.set("name", labName);
    start(async () => {
      const res = await addLabAction(fd);
      if (res?.error) { setErr(res.error); return; }
      setErr(""); setLabEmail(""); setLabName(""); setSaid(t("users.labAddedInvite"));
      router.refresh();
    });
  }

  const roleLabel = (r: StaffRole) => t(`account.role.${r}`);
  const tab = (key: Filter, label: string) => {
    const active = filter === key;
    return (
      <button
        type="button"
        onClick={() => setFilter(key)}
        style={{
          padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: active ? 700 : 600,
          cursor: "pointer", border: "1px solid var(--line)",
          color: active ? "#fff" : "var(--muted)", background: active ? "var(--green-light)" : "#fff",
        }}
      >
        {label}
      </button>
    );
  };

  const statusPill = (active: boolean) => (
    <span style={{ color: active ? "var(--success)" : "var(--muted)", fontWeight: 700, fontSize: 12 }}>
      ● {active ? t("users.status.active") : t("users.status.inactive")}
    </span>
  );

  return (
    <div>
      {!authEnabled && (
        <p className="mt-3" style={{ fontSize: 12.5, color: "var(--muted)", background: "var(--green-soft)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px" }}>
          {t("users.buildMode")}
        </p>
      )}

      <div className="flex items-center gap-2 mt-4">
        {tab("all", t("users.filter.all"))}
        {tab("staff", t("users.filter.staff"))}
        {canManageLabs && tab("labs", t("users.filter.labs"))}
        {pending && <span style={{ fontSize: 12, color: "var(--muted)" }}>…</span>}
      </div>

      {err && <p className="mt-3" style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}
      {said && <p className="mt-3" role="status" style={{ color: "var(--green-dark)", fontSize: 13 }}>{said}</p>}

      <div className="card mt-3 overflow-hidden">
        <table data-users-table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
              <th className="text-left p-2">{t("users.col.name")}</th>
              <th className="text-left p-2">{t("users.col.email")}</th>
              <th className="text-left p-2">{t("users.col.role")}</th>
              <th className="text-left p-2">{t("users.col.status")}</th>
              <th className="text-left p-2"></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={5} className="p-3" style={{ color: "var(--muted)" }}>
                {filter === "labs" ? t("users.noLabs") : t("users.noStaff")}
              </td></tr>
            )}

            {shown.map((r) => {
              const key = r.kind === "founder" ? `f:${r.email}` : `${r.kind}:${r.id}`;
              const you = r.you ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> {t("users.you")}</span> : null;

              if (r.kind === "founder") {
                return (
                  <tr key={key} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="p-2" style={{ color: "var(--muted)" }}>—{you}</td>
                    <td className="p-2">{r.email}</td>
                    <td className="p-2">
                      <span style={{ fontWeight: 700, color: "var(--green-dark)" }}>{roleLabel("manager")}</span>
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--green-light)", borderRadius: 999, padding: "2px 8px" }}>{t("users.founder")}</span>
                    </td>
                    <td className="p-2">{statusPill(true)}</td>
                    <td className="p-2" style={{ color: "var(--muted)", fontSize: 12 }} title={t("users.founderHint")}>
                      <div className="flex items-center gap-2 justify-end">
                        {canReset2fa && (
                          // the head of the PT provider only (Реш. 95), journalled
                          <button className="btn btn-sm" data-reset-2fa disabled={pending} style={{ fontSize: 12, padding: "5px 10px" }}
                            onClick={() => window.confirm(t("users.reset2faConfirm")) && run(() => resetTwoFactorAction("founder", r.email))}>
                            {t("users.reset2fa")}
                          </button>
                        )}
                        <span>🔒</span>
                      </div>
                    </td>
                  </tr>
                );
              }

              if (r.kind === "lab") {
                const active = r.status === "active";
                return (
                  <Fragment key={key}>
                  <tr style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="p-2">{r.name || "—"}{you}</td>
                    <td className="p-2">{r.email}</td>
                    <td className="p-2"><span style={{ color: "var(--muted)" }}>{t("users.type.lab")}</span></td>
                    <td className="p-2">{statusPill(active)}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2 justify-end">
                        {canManageLabs && <>
                        <button className="btn btn-sm" data-invite-open disabled={pending} style={{ fontSize: 12, padding: "5px 10px" }}
                          onClick={() => { setErr(""); setSaid(""); setPreviewFor(previewFor === r.id ? null : r.id); }}>
                          {t("users.invite")}
                        </button>
                        {canReset2fa && (
                        // the head of the PT provider only (Реш. 95), journalled
                        <button className="btn btn-sm" data-reset-2fa disabled={pending} style={{ fontSize: 12, padding: "5px 10px" }}
                          onClick={() => window.confirm(t("users.reset2faConfirm")) && run(() => resetTwoFactorAction("lab", r.id))}>
                          {t("users.reset2fa")}
                        </button>
                      )}
                        <button className="btn btn-sm" disabled={pending} style={{ fontSize: 12, padding: "5px 10px", borderColor: active ? "var(--red)" : "var(--line)", color: active ? "var(--red)" : "var(--ink)" }}
                          onClick={() => run(() => setLabStatusAction(r.id, (active ? "inactive" : "active") as LabStatus))}>
                          {active ? t("users.deactivate") : t("users.activate")}
                        </button>
                        </>}
                      </div>
                    </td>
                  </tr>
                  {previewFor === r.id && (
                    // the exact invitation, then «Изпрати» (part 1.8)
                    <tr data-invite-preview>
                      <td colSpan={5} className="p-3" style={{ background: "var(--green-soft)" }}>
                        <div className="text-xs font-bold" style={{ color: "var(--green-dark)" }}>{t("users.inviteExact")} · {r.email}</div>
                        <div className="text-sm mt-1"><b>{t("users.inviteSubject")}:</b> {invite.subject}</div>
                        <pre className="text-xs mt-2 p-2" style={{ whiteSpace: "pre-wrap", background: "#fff", border: "1px solid var(--line)", borderRadius: 6 }}>{invite.body}</pre>
                        <div className="flex gap-2 mt-2">
                          <button className="btn btn-primary btn-sm" data-invite-send disabled={pending}
                            onClick={() => {
                              setErr(""); setSaid("");
                              start(async () => {
                                const res = await inviteLabByIdAction(r.id, invite.key);
                                if (res?.error) { setErr(res.error); return; }
                                setPreviewFor(null); setSaid(t("users.inviteSent"));
                                router.refresh();
                              });
                            }}>
                            {t("users.inviteSend")}
                          </button>
                          <button className="btn btn-sm" disabled={pending} onClick={() => setPreviewFor(null)}>{t("users.inviteCancel")}</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              }

              // staff
              const active = r.status === "active";
              return (
                <tr key={key} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="p-2">{r.name || "—"}{you}</td>
                  <td className="p-2">{r.email}</td>
                  <td className="p-2">
                    <select
                      value={r.role}
                      disabled={pending || !canManagePeople || !!r.you}
                      onChange={(e) => run(() => setStaffRoleAction(r.id, e.target.value as StaffRole))}
                      style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13, background: "#fff" }}
                    >
                      {STAFF_ROLES.map((opt) => <option key={opt} value={opt}>{roleLabel(opt)}</option>)}
                    </select>
                  </td>
                  <td className="p-2">{statusPill(active)}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2 justify-end">
                      {canManagePeople && (
                      <button className="btn btn-sm" disabled={pending} style={{ fontSize: 12, padding: "5px 10px" }}
                        onClick={() => run(() => inviteStaffAction(r.email))}>
                        {t("users.invite")}
                      </button>
                      )}
                      {canReset2fa && (
                        // the head of the PT provider only (Реш. 95), journalled
                        <button className="btn btn-sm" data-reset-2fa disabled={pending} style={{ fontSize: 12, padding: "5px 10px" }}
                          onClick={() => window.confirm(t("users.reset2faConfirm")) && run(() => resetTwoFactorAction("staff", r.id))}>
                          {t("users.reset2fa")}
                        </button>
                      )}
                      {canManagePeople && !r.you && (
                      <button className="btn btn-sm" disabled={pending} style={{ fontSize: 12, padding: "5px 10px", borderColor: active ? "var(--red)" : "var(--line)", color: active ? "var(--red)" : "var(--ink)" }}
                        onClick={() => window.confirm(t(active ? "people.deactivateConfirm" : "people.activateConfirm")) && run(() => setStaffStatusAction(r.id, (active ? "inactive" : "active") as StaffStatus))}>
                        {active ? t("users.deactivate") : t("users.activate")}
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* add staff — the head of the PT provider (Реш. 141) */}
      {canManagePeople ? <>
      <h2 className="text-lg font-bold mt-7 mb-1 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
        {t("users.addTitle")}
      </h2>
      <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>{t("users.addHint")}</p>
      <form onSubmit={addStaff} className="grid gap-3 items-end" style={{ gridTemplateColumns: "2fr 1.4fr 1fr auto" }}>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("users.addEmail")}</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
            className="w-full rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--line)", background: "#fff" }} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("users.addName")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--line)", background: "#fff" }} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("users.addRole")}</span>
          <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}
            className="w-full rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--line)", background: "#fff" }}>
            {STAFF_ROLES.map((opt) => <option key={opt} value={opt}>{roleLabel(opt)}</option>)}
          </select></label>
        <button type="submit" className="btn btn-primary" disabled={pending}>{t("users.addButton")}</button>
      </form>
      </> : <p className="text-xs mt-4" data-people-head-only style={{ color: "var(--muted)" }}>{t("people.headOnly")}</p>}

      {/* add laboratory (creates a lab account + sends a portal invite) */}
      {canManageLabs && <>
      <h2 className="text-lg font-bold mt-7 mb-1 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
        {t("users.addLabTitle")}
      </h2>
      <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>{t("users.addLabHint")}</p>
      <form onSubmit={addLab} className="grid gap-3 items-end" style={{ gridTemplateColumns: "2fr 1.6fr auto" }}>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("users.addEmail")}</span>
          <input value={labEmail} onChange={(e) => setLabEmail(e.target.value)} type="email" required
            className="w-full rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--line)", background: "#fff" }} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t("users.addLabName")}</span>
          <input value={labName} onChange={(e) => setLabName(e.target.value)}
            className="w-full rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--line)", background: "#fff" }} /></label>
        <button type="submit" className="btn btn-primary" disabled={pending}>{t("users.addLabButton")}</button>
      </form>
      </>}
    </div>
  );
}
