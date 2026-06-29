"use client";

import { useState } from "react";
import { createFolderAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

// Trigger (a plain button or a dashed tile) + a modal that creates a PLAIN folder:
// just a name. No number/object/scheme fields. Lives under a type root, or inside
// `parentId` when nested. Type is implied by where the user is.
export default function NewFolderDialog({
  type, parentId, accent, soft, line, variant,
}: {
  type: "T" | "C"; parentId: string | null;
  accent: string; soft: string; line: string; variant: "button" | "tile";
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  const trigger =
    variant === "button" ? (
      <button onClick={() => setOpen(true)} className="btn">＋ {t("nf.new")}</button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%", minHeight: 150, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 6, border: `1.5px dashed ${line}`, borderRadius: 14, background: soft, cursor: "pointer", color: accent,
        }}
      >
        <span style={{ fontSize: 30, fontWeight: 600 }}>＋</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{t("nf.new")}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("nf.short")}</span>
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
            action={createFolderAction}
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: 460, maxWidth: "100%", padding: 26, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 18px 48px rgba(0,0,0,0.25)" }}
          >
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="parentId" value={parentId ?? ""} />
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 22, color: "var(--green-dark)" }}>{t("nf.title")}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{t("nf.subtitle")}</div>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{t("nf.name")}</span>
              <input name="name" required autoFocus placeholder={t("nf.namePlaceholder")}
                style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "11px 12px", fontSize: 14 }} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button type="button" onClick={() => setOpen(false)} className="btn">{t("common.cancel")}</button>
              <button type="submit" className="btn btn-primary">{t("nf.create")}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
