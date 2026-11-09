"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLaboratoryAction, setLaboratoryStateAction } from "@/lib/actions";
import type { Laboratory } from "@/lib/laboratories-model";

// A legal entity's laboratories (plan part 4.2): add one, correct it, make it inactive
// or active again — never deleted. onSubmit — a refusal keeps what was typed.

type View = Pick<Laboratory, "id" | "name" | "deliveryAddress" | "mobileOffice" | "accreditationNo" | "accreditationBody" | "state">;

export default function LaboratoryForms({ lang, entityId, labs, entityInactive }: { lang: "bg" | "en"; entityId: string; labs: View[]; entityInactive: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff", fontFamily: "inherit" } as const;
  const run = (fn: () => Promise<{ ok: true } | { ok: true; id: string } | { error: string }>, after?: () => void) =>
    start(async () => { setError(null); const r = await fn(); if ("error" in r) { setError(r.error); return; } after?.(); router.refresh(); });
  const form = (lab?: View) => (
    <form data-lab-form={lab ? lab.id : "new"} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "end" }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const el = e.currentTarget;
        run(() => saveLaboratoryAction({ id: lab?.id, entityId, name: fd.get("name"), deliveryAddress: fd.get("deliveryAddress"), mobileOffice: fd.get("mobileOffice"), accreditationNo: fd.get("accreditationNo"), accreditationBody: fd.get("accreditationBody"),
          shown: lab ? { name: lab.name, deliveryAddress: lab.deliveryAddress, mobileOffice: lab.mobileOffice, accreditationNo: lab.accreditationNo, accreditationBody: lab.accreditationBody } : undefined }), () => { if (!lab) el.reset(); }); // only what is changed is written (4.4 review)
      }}>
      <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Наименование по сертификата *", "Name as on the certificate *")}</span><input name="name" required maxLength={200} defaultValue={lab?.name} style={field} /></label>
      <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Адрес за доставка *", "Delivery address *")}</span><input name="deliveryAddress" required maxLength={300} defaultValue={lab?.deliveryAddress} style={field} /></label>
      <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("№ на акредитацията (за сведение)", "Accreditation no. (information only)")}</span><input name="accreditationNo" maxLength={60} defaultValue={lab?.accreditationNo} style={field} /></label>
      <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Орган по акредитация (за сведение)", "Accreditation body (information only)")}</span><input name="accreditationBody" maxLength={120} placeholder={L("напр. ИА „БСА“", "e.g. DAkkS")} defaultValue={lab?.accreditationBody} style={field} /></label>
      <label className="text-sm" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="mobileOffice" defaultChecked={lab?.mobileOffice} /> {L("Мобилен офис", "Mobile office")}</label>
      <div><button type="submit" className="btn btn-sm" disabled={pending}>{lab ? L("Запази", "Save") : L("Добави лабораторията", "Add the laboratory")}</button></div>
    </form>
  );
  return (
    <div className="mt-3" data-entity-labs={entityId}>
      <div className="text-sm font-bold" style={{ color: "var(--green-dark)" }}>{L("Лаборатории", "Laboratories")} ({labs.length})</div>
      {labs.length === 0 && <p className="text-xs" style={{ color: "var(--muted)" }}>{L("Още няма лаборатории.", "No laboratories yet.")}</p>}
      <div className="grid gap-2 mt-1">
        {labs.map((l) => (
          <div key={l.id} data-lab={l.id} data-lab-state={l.state} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", opacity: l.state === "inactive" ? 0.7 : 1 }}>
            <div className="text-sm"><b>{l.name}</b>{l.mobileOffice && <span className="text-xs" style={{ marginLeft: 6, color: "var(--muted)" }}>· {L("мобилен офис", "mobile office")}</span>} · {l.deliveryAddress}{(l.accreditationNo || l.accreditationBody) && <span style={{ color: "var(--muted)" }}> · {L("акр.", "accr.")} {[l.accreditationNo, l.accreditationBody].filter(Boolean).join(", ")}</span>}
              <span className="text-xs" style={{ marginLeft: 8, fontWeight: 700, color: l.state === "active" ? "var(--green-dark)" : "var(--muted)" }}>● {l.state === "active" ? L("активна", "active") : L("неактивна", "inactive")}</span></div>
            <div className="flex gap-2 mt-1" style={{ flexWrap: "wrap" }}>
              <details><summary className="text-xs" style={{ cursor: "pointer" }}>{L("Поправи", "Correct")}</summary><div className="mt-1">{form(l)}</div></details>
              {l.state === "active"
                ? <button type="button" className="btn btn-sm" data-lab-to="inactive" disabled={pending} onClick={() => { if (window.confirm(L("Да стане ли неактивна? Нищо не се изтрива.", "Make it inactive? Nothing is deleted."))) run(() => setLaboratoryStateAction(l.id, "inactive")); }}>{L("Направи неактивна", "Make inactive")}</button>
                : <button type="button" className="btn btn-sm" data-lab-to="active" disabled={pending || entityInactive} onClick={() => run(() => setLaboratoryStateAction(l.id, "active"))}>{L("Активирай", "Activate")}</button>}
            </div>
          </div>
        ))}
      </div>
      {!entityInactive && <details className="mt-2" data-lab-new><summary className="text-xs" style={{ cursor: "pointer", fontWeight: 700 }}>＋ {L("Нова лаборатория", "New laboratory")}</summary><div className="mt-2">{form()}</div></details>}
      {error && <div role="alert" data-lab-error style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px", fontSize: 13, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
