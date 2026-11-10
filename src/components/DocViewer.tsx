"use client";

import { useRef, useState } from "react";
import { issueCertificateAction } from "@/lib/actions";
import { looksLikeSimNumber } from "@/lib/environment";
import { useLang } from "@/components/LangProvider";

type Participant = { code: string; labName?: string; certNo?: string; certDate?: string; noCert?: boolean };

export default function DocViewer({
  id,
  doc,
  number,
  name,
  participants = [],
  canIssue = false,
}: {
  id: string;
  doc: string;
  number: string;
  name: string;
  participants?: Participant[];
  canIssue?: boolean; // issuing a certificate is a manager act (issueCertificateAction)
}) {
  const { t } = useLang();
  const [lang, setLang] = useState<"en" | "bg">("en");
  const [busy, setBusy] = useState(false);
  const [participant, setParticipant] = useState(""); // "" = blank/template
  // the answer to the last save: an error, or the number as it was stored
  const [certMsg, setCertMsg] = useState<{ ok: boolean; key: string; n: string } | null>(null);
  const [certBusy, setCertBusy] = useState(false);
  const certInFlight = useRef(false); // a second click/Enter while saving is ignored

  const sel = participants.find((p) => p.code === participant);
  const partQuery = participant ? `&p=${encodeURIComponent(participant)}` : "";

  async function generatePdf() {
    setBusy(true);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, doc, lang, participant: participant || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const suffix = participant ? `_${participant}` : "";
      a.href = url;
      a.download = `${number.replace(/[ /]/g, "_")}_${name.replace(/[ /]/g, "_")}${suffix}_${lang.toUpperCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(t("dv.pdfFailed") + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tab = (l: "en" | "bg", label: string) => (
    <button
      onClick={() => setLang(l)}
      className="btn"
      style={lang === l ? { background: "var(--green)", color: "#fff", borderColor: "var(--green)" } : {}}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {tab("en", "EN")}
        {tab("bg", "БГ")}
        {participants.length > 0 && (
          <select
            value={participant}
            onChange={(e) => { setParticipant(e.target.value); setCertMsg(null); }}
            className="btn"
            style={{ background: "#fff" }}
            title={t("dv.issueForLab")}
          >
            <option value="">{t("dv.blankTemplate")}</option>
            {participants.map((p) => (
              <option key={p.code} value={p.code}>
                {p.labName ? `${p.code} · ${p.labName}` : p.code}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary ml-auto" onClick={generatePdf} disabled={busy}>
          {busy ? t("dv.generating") : t("dv.generatePdf")}
        </button>
      </div>

      {/* certificate — the number as the ptsbg.eu register holds it, typed by PTS
          (the portal makes none up: PTS, 02.11.2026, condition 1), + the date */}
      {doc === "certificate" && participant && canIssue && sel?.noCert && (
        <p className="text-sm mb-3" data-cert-none style={{ color: "#8f2f2f" }}>{t("dv.certErr.nr")}</p>
      )}
      {doc === "certificate" && participant && canIssue && !sel?.noCert && (
        <form
          // onSubmit, not action={…}: React resets a form after its action, and a
          // refused number would wipe what was typed
          onSubmit={async (e) => {
            e.preventDefault();
            if (certInFlight.current) return;
            const fd = new FormData(e.currentTarget);
            certInFlight.current = true;
            setCertBusy(true);
            setCertMsg(null);
            try {
              const r = await issueCertificateAction(fd);
              setCertMsg("error" in r ? { ok: false, key: `dv.certErr.${r.error}`, n: number } : { ok: true, key: "dv.certSaved", n: r.no });
            } finally {
              certInFlight.current = false;
              setCertBusy(false);
            }
          }}
          data-cert-form
          className="flex items-center gap-2 mb-3 text-sm flex-wrap card p-2"
          style={{ background: "var(--green-soft)" }}
        >
          <input type="hidden" name="schemeId" value={id} />
          <input type="hidden" name="code" value={participant} />
          <label style={{ color: "var(--muted)" }}>
            {t("dv.certNo")}{" "}
            <input
              key={`${participant}-${sel?.certNo ?? "new"}`}
              name="no"
              required
              defaultValue={sel?.certNo ?? ""}
              placeholder={`${number}-12345`}
              className="rounded px-2 py-1"
              style={{ border: "1px solid var(--line)", background: "#fff", width: 230 }}
            />
          </label>
          <label className="ml-2" style={{ color: "var(--muted)" }}>
            {t("dv.issueDate")}{" "}
            <input
              key={`${participant}-${sel?.certDate ?? "new"}`}
              name="date"
              defaultValue={sel?.certDate ?? ""}
              placeholder="dd.mm.yyyy"
              className="rounded px-2 py-1"
              style={{ border: "1px solid var(--line)", background: "#fff", width: 110 }}
            />
          </label>
          {looksLikeSimNumber(number) ? (
            // a simulation round: nothing is entered in the register (Реш. 130, 1.2)
            <span className="ml-2" style={{ color: "#7a2e0e", fontWeight: 600 }}>{t("dv.simulationCert")}</span>
          ) : (
            <label className="ml-2 inline-flex items-center gap-1" style={{ color: "var(--ink)" }}>
              <input key={`reg-${participant}`} type="checkbox" name="inRegister" />
              {t("dv.inRegister")}
            </label>
          )}
          <button type="submit" className="btn" disabled={certBusy}>
            {t("dv.saveCert")}
          </button>
          <div className="w-full" style={{ fontSize: 12, color: "var(--muted)" }}>{t("dv.certHelp")}</div>
          {certMsg && (
            <div className="w-full" role={certMsg.ok ? "status" : "alert"} style={{ fontSize: 12.5, color: certMsg.ok ? "var(--green-dark)" : "var(--red)", fontWeight: 600 }}>
              {t(certMsg.key).replace("{n}", certMsg.n)}
            </div>
          )}
        </form>
      )}

      <div className="card overflow-hidden" style={{ height: "78vh" }}>
        <iframe
          key={`${lang}-${participant}-${sel?.certNo ?? ""}-${sel?.certDate ?? ""}`}
          title={`${name} preview`}
          src={`/schemes/${id}/doc/${doc}/print?lang=${lang}${partQuery}`}
          style={{ width: "100%", height: "100%", border: "0", background: "#fff" }}
        />
      </div>
    </div>
  );
}
