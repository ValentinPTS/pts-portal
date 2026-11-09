"use client";

import { useState } from "react";
import { createProjectAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";
import { composeSchemeNumber, type Activity, type SchemeKind } from "@/lib/scheme-number";
import type { DialogNumbering } from "@/lib/folders";

// Trigger (a green button or a dashed tile) + a modal that creates a new scheme
// folder: friendly name + the official number + object. Type is implied by the
// folder the user is in; the number is composed from the kind (PTS/ILC), the
// activity (T/S here, C in calibration) and NA (Реш. 102, part 3.1) — PTS may type
// another, and the server takes the markers from what the number states.
export default function NewProjectDialog({
  type, typeLabel, year, numbering, accent, soft, line, variant, folderId = null, samples = [],
}: {
  type: "T" | "C"; typeLabel: string; year: string; numbering: DialogNumbering;
  accent: string; soft: string; line: string; variant: "button" | "tile";
  folderId?: string | null;
  samples?: { key: string; label: string }[];
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SchemeKind>("PTS");
  const [activity, setActivity] = useState<Activity>(type === "C" ? "C" : "T");
  const [na, setNa] = useState(false);
  const compose = (k: SchemeKind, a: Activity, n: boolean) =>
    composeSchemeNumber({ kind: k, activity: a, na: n, simulation: numbering.simulation }, numbering.yy, numbering.mm, numbering.next[a] ?? 1);
  const [number, setNumber] = useState(() => compose("PTS", type === "C" ? "C" : "T", false));
  // a change of kind, activity or NA composes the number again; ILC is NA by default —
  // today they coincide, though they are two fields (Реш. 102, А4)
  const pickMarkers = (k: SchemeKind, a: Activity, n: boolean) => { setKind(k); setActivity(a); setNa(n); setNumber(compose(k, a, n)); };

  function pickSample(key: string) {
    setSample(key);
    const s = samples.find((x) => x.key === key);
    if (s) setName(s.label); // pre-fill the friendly name; the sample carries the rest
  }

  const trigger =
    variant === "button" ? (
      <button onClick={() => setOpen(true)} className="btn btn-primary">＋ {t("np.newScheme")}</button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%", minHeight: 150, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 6, border: `1.5px dashed ${line}`, borderRadius: 14, background: "transparent", cursor: "pointer", color: accent,
        }}
      >
        <span style={{ fontSize: 30, fontWeight: 600 }}>＋</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{t("np.newScheme")}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("np.createsSchemeShort2")}</span>
      </button>
    );

  return (
    <>
      {trigger}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,30,22,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 50, padding: "6vh 16px", overflowY: "auto" }}
        >
          <form
            action={createProjectAction}
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: 500, maxWidth: "100%", padding: 26, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 18px 48px rgba(0,0,0,0.25)" }}
          >
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="folderId" value={folderId ?? ""} />
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 22, color: "var(--green-dark)" }}>
                {t("np.inPrefix")} {typeLabel} · {year}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{t("np.subtitle")}</div>
            </div>

            {samples.length > 0 && (
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{t("np.startFrom")}</span>
                <select name="sample" value={sample} onChange={(e) => pickSample(e.target.value)}
                  style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "11px 12px", fontSize: 14, background: "#fff" }}>
                  <option value="">{t("np.blank")}</option>
                  {samples.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                {sample && <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("np.sampleHint")}</span>}
              </label>
            )}

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{t("np.name")}</span>
              <input name="name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("np.namePlaceholder")}
                style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "11px 12px", fontSize: 14 }} />
            </label>

            <div data-number-markers style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 180px" }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{t("np.kind")}</span>
                  <select name="kind" value={kind} onChange={(e) => { const k = e.target.value === "ILC" ? "ILC" : "PTS"; pickMarkers(k, activity, k === "ILC"); }}
                    style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "10px 12px", fontSize: 14, background: "#fff" }}>
                    <option value="PTS">{t("np.kindPTS")}</option>
                    <option value="ILC">{t("np.kindILC")}</option>
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{t("np.activity")}</span>
                  {type === "C" ? (
                    <span style={{ padding: "10px 0", fontSize: 14 }}>{t("np.activityC")}</span>
                  ) : (
                    <select name="activity" value={activity} onChange={(e) => pickMarkers(kind, e.target.value === "S" ? "S" : "T", na)}
                      style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "10px 12px", fontSize: 14, background: "#fff" }}>
                      <option value="T">{t("np.activityT")}</option>
                      <option value="S">{t("np.activityS")}</option>
                    </select>
                  )}
                </label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input type="checkbox" name="na" checked={na} onChange={(e) => pickMarkers(kind, activity, e.target.checked)} />
                {t("np.na")}
              </label>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{t("np.officialNumber")}</span>
              <input name="number" required value={number} onChange={(e) => setNumber(e.target.value)}
                style={{ background: soft, border: `1px solid ${line}`, color: accent, fontWeight: 700, fontSize: 15, padding: "11px 12px", borderRadius: 9, fontFamily: "var(--font-sans)", letterSpacing: "0.01em" }} />
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("np.autoAssigned")} {t("np.markersHint")}</span>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{t("np.object")}</span>
              <input name="object" placeholder={t("np.objectPlaceholder")}
                style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "11px 12px", fontSize: 14 }} />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button type="button" onClick={() => setOpen(false)} className="btn">{t("common.cancel")}</button>
              <button type="submit" className="btn btn-primary">{t("np.create")}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
