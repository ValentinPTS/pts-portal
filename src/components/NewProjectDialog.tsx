"use client";

import { useState } from "react";
import { createProjectAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

// Trigger (a green button or a dashed tile) + a modal that creates a new scheme
// folder: friendly name + auto-assigned official PTS number + object. Type is
// implied by the folder the user is in.
export default function NewProjectDialog({
  type, typeLabel, year, nextNumber, accent, soft, line, variant,
}: {
  type: "T" | "C"; typeLabel: string; year: string; nextNumber: string;
  accent: string; soft: string; line: string; variant: "button" | "tile";
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  const trigger =
    variant === "button" ? (
      <button onClick={() => setOpen(true)} className="btn btn-primary">＋ {t("np.new")}</button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%", minHeight: 150, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 6, border: `1.5px dashed ${line}`, borderRadius: 14, background: "transparent", cursor: "pointer", color: accent,
        }}
      >
        <span style={{ fontSize: 30, fontWeight: 600 }}>＋</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{t("np.new")}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("np.createsSchemeShort")}</span>
      </button>
    );

  return (
    <>
      {trigger}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,30,22,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 50, padding: "10vh 16px" }}
        >
          <form
            action={createProjectAction}
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: 500, maxWidth: "100%", padding: 26, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 18px 48px rgba(0,0,0,0.25)" }}
          >
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="year" value={year} />
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 22, color: "var(--green-dark)" }}>
                {t("np.inPrefix")} {typeLabel} · {year}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{t("np.subtitle")}</div>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{t("np.name")}</span>
              <input name="name" required autoFocus placeholder={t("np.namePlaceholder")}
                style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "11px 12px", fontSize: 14 }} />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{t("np.officialNumber")}</span>
              <input name="number" required defaultValue={nextNumber}
                style={{ background: soft, border: `1px solid ${line}`, color: accent, fontWeight: 700, fontSize: 15, padding: "11px 12px", borderRadius: 9, fontFamily: "var(--font-sans)", letterSpacing: "0.01em" }} />
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("np.autoAssigned")}</span>
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
