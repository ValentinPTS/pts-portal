"use client";

import { useActionState, useState } from "react";
import { approveLabApplicationAction, rejectLabApplicationAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

export type PendingAppView = {
  id: string;
  orgName: string;
  country: string;
  region: "eu" | "non_eu";
  email: string;
  phone: string;
  contactPerson: string;
  address: string;
  accreditationBody: string;
  accreditationNo: string;
  eik: string;
  vat: string;
  eikValid: boolean | null;
  vatStatus: string | null;
  vatName: string | null;
  createdAt: string;
  docs: { name: string; url: string }[];
};

type ApproveState = { ok?: boolean; email?: string; tempPassword?: string; error?: string };
type RejectState = { ok?: boolean; error?: string };

function Pill({ tone, children }: { tone: "ok" | "bad" | "warn" | "muted"; children: React.ReactNode }) {
  const bg = { ok: "#e7f4ea", bad: "#fdeaea", warn: "#fdf4e3", muted: "var(--green-soft)" }[tone];
  const fg = { ok: "#1c7a3d", bad: "#b4291f", warn: "#9a6b12", muted: "var(--muted)" }[tone];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, background: bg, color: fg, borderRadius: 999, padding: "2px 8px" }}>
      {children}
    </span>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}

function AppCard({ app }: { app: PendingAppView }) {
  const { lang } = useLang();
  const bg = lang === "bg";
  const L = (en: string, bgTxt: string) => (bg ? bgTxt : en);
  const [done, setDone] = useState<null | "approved" | "rejected">(null);
  const [showReject, setShowReject] = useState(false);
  const [copied, setCopied] = useState(false);

  const [aState, approve, aPending] = useActionState<ApproveState, FormData>(
    async (_p, fd) => approveLabApplicationAction(fd), {},
  );
  const [rState, reject, rPending] = useActionState<RejectState, FormData>(
    async (_p, fd) => rejectLabApplicationAction(fd), {},
  );

  // Reflect a successful action locally (the card stays put so the temp password is
  // readable; a manual reload drops it since it's no longer pending server-side).
  if (aState.ok && done !== "approved") setDone("approved");
  if (rState.ok && done !== "rejected") setDone("rejected");

  const vatTone = app.vatStatus === "valid" ? "ok" : app.vatStatus === "invalid" ? "bad" : "warn";
  const vatLabel =
    app.vatStatus === "valid" ? L("VAT valid", "ДДС валиден")
      : app.vatStatus === "invalid" ? L("VAT invalid", "ДДС невалиден")
      : L("VAT unchecked", "ДДС непроверен");

  return (
    <div className="card p-4" style={{ opacity: done ? 0.75 : 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>{app.orgName || app.email}</strong>
        <Pill tone="muted">{app.region === "eu" ? L("EU", "ЕС") : L("Non-EU", "Извън ЕС")}</Pill>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{app.country}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
          {new Date(app.createdAt).toLocaleString()}
        </span>
      </div>

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Field label={L("Contact", "Контакт")} value={app.contactPerson} />
        <Field label={L("E-mail", "Имейл")} value={app.email} />
        <Field label={L("Phone", "Телефон")} value={app.phone} />
        <Field label={L("Address", "Адрес")} value={app.address} />
        <Field label={L("Accreditation body", "Орган по акредитация")} value={app.accreditationBody} />
        <Field label={L("Accreditation №", "Акредитация №")} value={app.accreditationNo} />
      </div>

      {/* EU verification */}
      {app.region === "eu" && (
        <div className="mt-3" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {app.eik && (
            <span style={{ fontSize: 13 }}>
              {L("ЕИК", "ЕИК")}: <code>{app.eik}</code>{" "}
              {app.eikValid === true ? <Pill tone="ok">{L("checksum ok", "валиден чек")}</Pill>
                : app.eikValid === false ? <Pill tone="bad">{L("bad checksum", "невалиден чек")}</Pill> : null}
            </span>
          )}
          {app.vat && (
            <span style={{ fontSize: 13 }}>
              {L("VAT", "ДДС")}: <code>{app.vat}</code> <Pill tone={vatTone}>{vatLabel}</Pill>
            </span>
          )}
          {app.vatName && <span style={{ fontSize: 12, color: "var(--muted)" }}>({app.vatName})</span>}
        </div>
      )}

      {/* Non-EU documents (short-lived signed links) */}
      {app.region === "non_eu" && app.docs.length > 0 && (
        <div className="mt-3">
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{L("Documents", "Документи")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {app.docs.map((d, i) => (
              <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                className="btn" style={{ fontSize: 12, padding: "4px 10px", border: "1px solid var(--line)" }}>
                {L("Document", "Документ")} {i + 1}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Result / actions */}
      {done === "approved" && aState.tempPassword ? (
        <div className="mt-4 p-3 rounded" style={{ background: "#e7f4ea", border: "1px solid #b9e0c4" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1c7a3d" }}>{L("Account created", "Акаунтът е създаден")}</div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {L(
              "Share these securely with the lab. They sign in at /lab/login and should change the password after first sign-in.",
              "Споделете ги сигурно с лабораторията. Тя влиза през /lab/login и трябва да смени паролата след първия вход.",
            )}
          </p>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <div>{L("E-mail", "Имейл")}: <code>{aState.email}</code></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              {L("Temp password", "Временна парола")}: <code style={{ userSelect: "all" }}>{aState.tempPassword}</code>
              <button type="button" className="btn" style={{ fontSize: 11, padding: "2px 8px", border: "1px solid var(--line)" }}
                onClick={() => { navigator.clipboard?.writeText(`${aState.email} / ${aState.tempPassword}`); setCopied(true); }}>
                {copied ? L("Copied", "Копирано") : L("Copy", "Копирай")}
              </button>
            </div>
          </div>
        </div>
      ) : done === "rejected" ? (
        <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>{L("Application rejected.", "Заявката е отхвърлена.")}</p>
      ) : (
        <div className="mt-4" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <form action={approve}>
            <input type="hidden" name="id" value={app.id} />
            <button type="submit" disabled={aPending} className="btn btn-primary" style={{ fontSize: 13 }}>
              {aPending ? L("Approving…", "Одобряване…") : L("Approve", "Одобри")}
            </button>
          </form>
          {!showReject ? (
            <button type="button" className="btn" style={{ fontSize: 13, border: "1px solid var(--line)" }}
              onClick={() => setShowReject(true)}>
              {L("Reject", "Отхвърли")}
            </button>
          ) : (
            <form action={reject} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="id" value={app.id} />
              <input name="reason" placeholder={L("Reason (optional)", "Причина (по избор)")} maxLength={500}
                className="rounded px-2 py-1" style={{ border: "1px solid var(--line)", fontSize: 13, minWidth: 200 }} />
              <button type="submit" disabled={rPending} className="btn btn-primary" style={{ fontSize: 13, background: "#b4291f" }}>
                {rPending ? L("Rejecting…", "Отхвърляне…") : L("Confirm reject", "Потвърди")}
              </button>
            </form>
          )}
          {(aState.error || rState.error) && (
            <span className="text-sm" style={{ color: "var(--red)" }}>{aState.error || rState.error}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function PendingLabApplications({ apps }: { apps: PendingAppView[] }) {
  const { lang } = useLang();
  const bg = lang === "bg";
  if (!apps.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold" style={{ color: "var(--green-dark)" }}>
        {bg ? "Заявки за акаунти на лаборатории" : "Pending laboratory applications"}
        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>({apps.length})</span>
      </h2>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 720 }}>
        {bg
          ? "Прегледайте и одобрете, за да създадете акаунт. При одобрение получавате еднократна временна парола за лабораторията."
          : "Review and approve to create the account. Approval gives you a one-time temporary password to hand to the lab."}
      </p>
      <div className="grid gap-3 mt-4">
        {apps.map((a) => <AppCard key={a.id} app={a} />)}
      </div>
    </section>
  );
}
