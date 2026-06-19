"use client";

import { useState } from "react";
import { issueCertificateAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

type Participant = { code: string; labName: string; certNo?: string; certDate?: string };

export default function DocViewer({
  id,
  doc,
  number,
  name,
  participants = [],
}: {
  id: string;
  doc: string;
  number: string;
  name: string;
  participants?: Participant[];
}) {
  const { t } = useLang();
  const [lang, setLang] = useState<"en" | "bg">("en");
  const [busy, setBusy] = useState(false);
  const [participant, setParticipant] = useState(""); // "" = blank/template

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
            onChange={(e) => setParticipant(e.target.value)}
            className="btn"
            style={{ background: "#fff" }}
            title={t("dv.issueForLab")}
          >
            <option value="">{t("dv.blankTemplate")}</option>
            {participants.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.labName}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary ml-auto" onClick={generatePdf} disabled={busy}>
          {busy ? t("dv.generating") : t("dv.generatePdf")}
        </button>
      </div>

      {/* certificate issuance — assign/store the number + date for the selected lab */}
      {doc === "certificate" && participant && (
        <form
          action={issueCertificateAction}
          className="flex items-center gap-2 mb-3 text-sm flex-wrap card p-2"
          style={{ background: "var(--green-soft)" }}
        >
          <input type="hidden" name="schemeId" value={id} />
          <input type="hidden" name="code" value={participant} />
          <span style={{ color: "var(--muted)" }}>{t("dv.certNo")}</span>
          <b style={{ color: sel?.certNo ? "var(--green-dark)" : "var(--muted)" }}>
            {sel?.certNo ?? t("dv.notIssued")}
          </b>
          <label className="ml-2" style={{ color: "var(--muted)" }}>
            {t("dv.issueDate")}{" "}
            <input
              key={sel?.certDate ?? "new"}
              name="date"
              defaultValue={sel?.certDate ?? ""}
              placeholder="dd.mm.yyyy"
              className="rounded px-2 py-1"
              style={{ border: "1px solid var(--line)", background: "#fff", width: 110 }}
            />
          </label>
          <button type="submit" className="btn">
            {sel?.certNo ? t("dv.saveDate") : t("dv.issueAuto")}
          </button>
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
