"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEntityUserAction, setEntityUserStateAction, inviteEntityUserAction, appointEntityAdminAction } from "@/lib/actions";
import { POSITION_SUGGESTIONS, ROLE_LABEL, USER_STATE_LABEL, type EntityUser } from "@/lib/entity-users-model";

// A legal entity's users (plan part 4.3): add one, correct it, make it inactive or back
// — never deleted. «поканен» until the invitation is accepted (4.4). onSubmit — a
// refusal keeps what was typed.

type View = Pick<EntityUser, "id" | "email" | "name" | "position" | "phone" | "role" | "twoFactorRequired" | "receivesNotices" | "state"> & { linked: boolean };

// the invitation (4.4): its exact text shown before «Изпрати», its key sent with it (1.8)
// the appointment of an administrator (9.1): the notice to the official e-mail shown before «Назначи» (К23)
export default function EntityUserForms({ lang, entityId, users, entityInactive, invite, appoint, labOwned }: { lang: "bg" | "en"; entityId: string; users: View[]; entityInactive: boolean; invite: { subject: string; body: string; key: string }; appoint?: { subject: string; body: string; key: string }; labOwned?: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff", fontFamily: "inherit" } as const;
  const run = (fn: () => Promise<{ ok: true } | { ok: true; id: string } | { error: string }>, after?: () => void) =>
    start(async () => { setError(null); setDone(null); const r = await fn(); if ("error" in r) { setError(r.error); return; } after?.(); router.refresh(); });
  const listId = `positions-${entityId}`;
  const form = (u?: View) => (
    <form data-user-form={u ? u.id : "new"} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", alignItems: "end" }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const el = e.currentTarget;
        run(() => saveEntityUserAction({ id: u?.id, entityId, email: fd.get("email"), name: fd.get("name"), position: fd.get("position"), phone: fd.get("phone"), role: fd.get("role"), twoFactorRequired: fd.get("twoFactorRequired"), receivesNotices: fd.get("receivesNotices"),
          shown: u ? { email: u.email, name: u.name, position: u.position, phone: u.phone, role: u.role, twoFactorRequired: u.twoFactorRequired, receivesNotices: u.receivesNotices } : undefined }), () => { if (!u) el.reset(); }); // only what is changed is written (4.4 review)
      }}>
      <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Име *", "Name *")}</span><input name="name" required maxLength={120} defaultValue={u?.name} style={field} /></label>
      <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("E-mail за вход *", "Login e-mail *")}</span><input name="email" type="email" required maxLength={254} defaultValue={u?.email} style={field} /></label>
      <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Длъжност (за сведение)", "Position (information only)")}</span><input name="position" list={listId} maxLength={120} defaultValue={u?.position} style={field} /></label>
      <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Телефон", "Phone")}</span><input name="phone" maxLength={40} defaultValue={u?.phone} style={field} /></label>
      {labOwned
        ? <input type="hidden" name="role" value={u?.role ?? "user"} />
        : <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Роля", "Role")}</span>
          <select name="role" defaultValue={u?.role ?? "user"} style={field}><option value="user">{L(ROLE_LABEL.user.bg, ROLE_LABEL.user.en)}</option><option value="admin">{L(ROLE_LABEL.admin.bg, ROLE_LABEL.admin.en)}</option></select></label>}
      <label className="text-sm" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="twoFactorRequired" defaultChecked={u?.twoFactorRequired} /> {L("Двустепенен вход задължителен", "Two-step sign-in required")}</label>
      <label className="text-sm" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="receivesNotices" defaultChecked={u ? u.receivesNotices : true} /> {L("Получава известията по e-mail", "Receives the notices by e-mail")}</label>
      <div><button type="submit" className="btn btn-sm" disabled={pending}>{u ? L("Запази", "Save") : L("Добави потребителя", "Add the user")}</button></div>
    </form>
  );
  return (
    <div className="mt-3" data-entity-users={entityId}>
      <datalist id={listId}>{POSITION_SUGGESTIONS.map((p) => <option key={p.bg} value={L(p.bg, p.en)} />)}</datalist>
      <div className="text-sm font-bold" style={{ color: "var(--green-dark)" }}>{L("Потребители", "Users")} ({users.length}) <span className="text-xs" style={{ fontWeight: 400, color: "var(--muted)" }}>— {L("всеки вижда всички лаборатории на юридическото лице", "each sees all the legal entity's laboratories")}</span></div>
      {users.length === 0 && <p className="text-xs" style={{ color: "var(--muted)" }}>{L("Още няма потребители. Първият става администратор на профила.", "No users yet. The first one becomes the profile's administrator.")}</p>}
      <div className="grid gap-2 mt-1">
        {users.map((u) => (
          <div key={u.id} data-user={u.id} data-user-state={u.state} data-user-role={u.role} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", opacity: u.state === "inactive" ? 0.7 : 1 }}>
            <div className="text-sm"><b>{u.name}</b> · {u.email}{u.position && <span style={{ color: "var(--muted)" }}> · {u.position}</span>}{u.phone && <span style={{ color: "var(--muted)" }}> · {u.phone}</span>}
              <span className="text-xs" style={{ marginLeft: 8, fontWeight: 700 }}>{L(ROLE_LABEL[u.role].bg, ROLE_LABEL[u.role].en)}</span>
              {u.twoFactorRequired && <span className="text-xs" style={{ marginLeft: 6, color: "var(--muted)" }}>· 2FA</span>}
              <span className="text-xs" data-user-notices={u.receivesNotices ? "1" : "0"} style={{ marginLeft: 6, color: "var(--muted)" }}>· {u.receivesNotices ? L("получава известията", "receives the notices") : L("без известия по e-mail", "no notices by e-mail")}</span>
              <span className="text-xs" style={{ marginLeft: 8, color: u.state === "active" ? "var(--green-dark)" : "var(--muted)" }}>● {L(USER_STATE_LABEL[u.state].bg, USER_STATE_LABEL[u.state].en)}</span></div>
            <div className="flex gap-2 mt-1" style={{ flexWrap: "wrap" }}>
              <details><summary className="text-xs" style={{ cursor: "pointer" }}>{L("Поправи", "Correct")}</summary><div className="mt-1">{form(u)}</div></details>
              {u.state === "invited" && !entityInactive && (
                <details data-user-invite={u.id}><summary className="text-xs" style={{ cursor: "pointer", fontWeight: 700 }}>{u.linked ? L("Изпрати поканата отново", "Send the invitation again") : L("Покани", "Invite")}</summary>
                  <div className="mt-1" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", background: "var(--bg)" }}>
                    <div className="text-xs"><b>{L("До", "To")}:</b> {u.email}</div>
                    <div className="text-xs"><b>{L("Тема", "Subject")}:</b> {invite.subject}</div>
                    <pre className="text-xs mt-1" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{invite.body}</pre>
                    <button type="button" className="btn btn-sm btn-primary mt-1" data-user-invite-send={u.id} disabled={pending} onClick={() => run(() => inviteEntityUserAction(u.id, invite.key), () => setDone(L(`Поканата до ${u.email} е изпратена.`, `The invitation to ${u.email} is sent.`)))}>{L("Изпрати", "Send")}</button>
                  </div>
                </details>
              )}
              {appoint && u.state === "active" && !entityInactive && (u.role !== "admin" || users.filter((x) => x.role === "admin" && x.state !== "inactive").length > 1) && (
                <details data-user-appoint={u.id}><summary className="text-xs" style={{ cursor: "pointer", fontWeight: 700 }}>{u.role === "admin" ? L("Остави само този администратор", "Keep only this administrator") : L("Назначи за администратор", "Appoint the administrator")}</summary>
                  <div className="mt-1" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", background: "var(--bg)" }}>
                    <div className="text-xs">{L("Уведомлението до официалния e-mail на организацията (К23):", "The notice to the organisation's official e-mail (К23):")}</div>
                    <div className="text-xs"><b>{L("Тема", "Subject")}:</b> {appoint.subject}</div>
                    <pre className="text-xs mt-1" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{appoint.body}</pre>
                    <label className="text-xs" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}><input type="checkbox" data-user-appoint-demote defaultChecked /> {L("досегашният администратор става потребител", "the administrator before becomes a user")}</label>
                    <button type="button" className="btn btn-sm btn-primary mt-1" data-user-appoint-send={u.id} disabled={pending}
                      onClick={(ev) => { const box = (ev.currentTarget.parentElement?.querySelector("[data-user-appoint-demote]") as HTMLInputElement | null); run(() => appointEntityAdminAction(u.id, !!box?.checked, appoint.key), () => setDone(L(`${u.name} е администратор на профила.`, `${u.name} is the profile's administrator.`))); }}>{L("Назначи", "Appoint")}</button>
                  </div>
                </details>
              )}
              {u.state !== "inactive"
                ? <button type="button" className="btn btn-sm" data-user-to="inactive" disabled={pending} onClick={() => { if (window.confirm(L("Да стане ли неактивен? Нищо не се изтрива.", "Make the user inactive? Nothing is deleted."))) run(() => setEntityUserStateAction(u.id, "inactive")); }}>{L("Направи неактивен", "Make inactive")}</button>
                : <button type="button" className="btn btn-sm" data-user-to="active" disabled={pending || entityInactive} onClick={() => run(() => setEntityUserStateAction(u.id, "active"))}>{L("Върни", "Bring back")}</button>}
            </div>
          </div>
        ))}
      </div>
      {!entityInactive && <details className="mt-2" data-user-new><summary className="text-xs" style={{ cursor: "pointer", fontWeight: 700 }}>＋ {L("Нов потребител", "New user")}</summary><div className="mt-2">{form()}</div></details>}
      {done && <div role="status" data-user-done style={{ color: "var(--green-dark)", fontSize: 13, marginTop: 6 }}>{done}</div>}
      {error && <div role="alert" data-user-error style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px", fontSize: 13, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
