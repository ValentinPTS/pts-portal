"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProfileAction } from "@/lib/actions";
import type { Laboratory } from "@/lib/laboratories-model";

// The laboratory's review of its data (plan part 4.4): complete it, save it — and, the
// profile's administrator, confirm it (once). onSubmit — a refusal keeps the typing.

type Lab = Pick<Laboratory, "id" | "name" | "deliveryAddress" | "mobileOffice" | "accreditationNo" | "accreditationBody" | "state">;

export default function ProfileConfirmForm({ lang, admin, confirmed, entity, labs, own }: {
  lang: "bg" | "en"; admin: boolean; confirmed: boolean;
  entity: { correspondenceAddress: string; officialEmail: string; mol: string; language: "bg" | "en" };
  labs: Lab[]; own: { name: string; position: string; phone: string; email: string; receivesNotices: boolean };
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "7px 9px", fontSize: 14, background: "#fff", fontFamily: "inherit", width: "100%" } as const;
  const ro = { ...field, background: "var(--bg)", color: "var(--muted)" } as const;
  const lbl = (bg: string, en: string, el: React.ReactNode) => (
    <label style={{ display: "grid", gap: 4, marginBottom: 12 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L(bg, en)}</span>{el}</label>
  );
  const active = labs.filter((l) => l.state === "active");
  // what the page showed: only what the person changes is written (4.4 review)
  const shown = JSON.stringify({
    entity: { correspondenceAddress: entity.correspondenceAddress, mol: entity.mol, language: entity.language },
    laboratories: Object.fromEntries(active.map((l) => [l.id, { name: l.name, deliveryAddress: l.deliveryAddress, mobileOffice: l.mobileOffice, accreditationNo: l.accreditationNo, accreditationBody: l.accreditationBody }])),
    own: { name: own.name, position: own.position, phone: own.phone, receivesNotices: own.receivesNotices },
  });
  return (
    <form data-profile-form className="card" style={{ padding: 20 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const confirm = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "confirm";
        const input: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
        input.shown = shown;
        start(async () => {
          setError(null); setDone(null);
          const r = await saveProfileAction(input, confirm);
          if ("error" in r) { setError(r.error); return; }
          setDone(r.confirmedAt
            ? r.notice === "sent" ? L("Потвърдено. Уведомление тръгна до официалния e-mail на организацията.", "Confirmed. A notice went to the organisation's official e-mail.")
              : r.notice === "not-sent" ? L("Потвърдено. Уведомлението до официалния e-mail не тръгна — записано е и PTS ще го изпрати отново.", "Confirmed. The notice to the official e-mail did not go — it is on record and PTS will send it again.")
              : L("Записано. Данните бяха потвърдени и преди.", "Saved. The data was confirmed before.")
            : L("Записано.", "Saved."));
          router.refresh();
        });
      }}>
      <h2 className="field-label" style={{ fontSize: 15 }}>{L("За връзка с организацията", "To reach the organisation")}</h2>
      {lbl("Адрес за кореспонденция *", "Address for correspondence *", <input name="correspondenceAddress" required={admin} maxLength={300} defaultValue={entity.correspondenceAddress} readOnly={!admin} style={admin ? field : ro} />)}
      {lbl("Официален e-mail — тук идват уведомленията до организацията (промяна — чрез PTS)", "Official e-mail — the notices to the organisation come here (a change — through PTS)", <input value={entity.officialEmail || "—"} readOnly aria-readonly="true" data-official-email style={ro} />)}
      {lbl("МОЛ", "МОЛ (responsible person)", <input name="mol" maxLength={120} defaultValue={entity.mol} readOnly={!admin} style={admin ? field : ro} />)}
      {lbl("Език на документите и писмата", "Language of documents and messages",
        <select name="language" defaultValue={entity.language} disabled={!admin} style={admin ? field : ro}><option value="bg">{L("български", "Bulgarian")}</option><option value="en">{L("английски", "English")}</option></select>)}

      <h2 className="field-label" style={{ fontSize: 15, marginTop: 8 }}>{L("Лаборатории", "Laboratories")} ({active.length})</h2>
      {active.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>{L("PTS още не е въвел лаборатория — пишете на office@ptsbg.eu.", "PTS has not entered a laboratory yet — write to office@ptsbg.eu.")}</p>}
      {active.map((l) => (
        <fieldset key={l.id} data-profile-lab={l.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
          {lbl("Наименование по сертификата за акредитация *", "Name as on the accreditation certificate *", <input name={`lab_${l.id}_name`} required={admin} maxLength={200} defaultValue={l.name} readOnly={!admin} style={admin ? field : ro} />)}
          {lbl("Адрес за доставка *", "Delivery address *", <input name={`lab_${l.id}_deliveryAddress`} required={admin} maxLength={300} defaultValue={l.deliveryAddress} readOnly={!admin} style={admin ? field : ro} />)}
          {lbl("Номер на акредитацията (за сведение)", "Accreditation number (information only)", <input name={`lab_${l.id}_accreditationNo`} maxLength={60} defaultValue={l.accreditationNo} readOnly={!admin} style={admin ? field : ro} />)}
          {lbl("Орган по акредитация (за сведение)", "Accreditation body (information only)", <input name={`lab_${l.id}_accreditationBody`} maxLength={120} defaultValue={l.accreditationBody} readOnly={!admin} style={admin ? field : ro} />)}
          <label className="text-sm" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name={`lab_${l.id}_mobileOffice`} defaultChecked={l.mobileOffice} disabled={!admin} /> {L("Мобилен офис", "Mobile office")}</label>
        </fieldset>
      ))}

      <h2 className="field-label" style={{ fontSize: 15, marginTop: 8 }}>{L("Вашите данни", "Your details")}</h2>
      {lbl("E-mail за вход", "Login e-mail", <input value={own.email} disabled style={ro} />)}
      {lbl("Име *", "Name *", <input name="ownName" required maxLength={120} defaultValue={own.name} style={field} />)}
      {lbl("Длъжност (за сведение)", "Position (information only)", <input name="ownPosition" maxLength={120} defaultValue={own.position} style={field} />)}
      {lbl("Телефон", "Phone", <input name="ownPhone" maxLength={40} defaultValue={own.phone} style={field} />)}
      <label className="text-sm" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12 }}><input type="checkbox" name="ownReceivesNotices" defaultChecked={own.receivesNotices} data-own-notices /> {L("Получавам известията на лабораториите по e-mail", "I receive the laboratories' notices by e-mail")}</label>

      {admin && !confirmed && (
        <label className="text-sm" data-confirm-tick style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "8px 0 12px" }}>
          <input type="checkbox" name="confirmTick" style={{ marginTop: 3 }} />
          <span>{L("Прегледах данните — верни са. Потвърждавам ги от името на организацията.", "I have reviewed the data — it is right. I confirm it on the organisation's behalf.")}</span>
        </label>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="submit" name="mode" value="save" className="btn" disabled={pending}>{L("Запази", "Save")}</button>
        {admin && !confirmed && <button type="submit" name="mode" value="confirm" className="btn btn-primary" disabled={pending}>{L("Запази и потвърди", "Save and confirm")}</button>}
      </div>
      {done && <div role="status" data-profile-done style={{ color: "var(--green-dark)", fontSize: 13, marginTop: 10 }}>{done}</div>}
      {error && <div role="alert" data-profile-error style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px", fontSize: 13, marginTop: 10 }}>{error}</div>}
    </form>
  );
}
