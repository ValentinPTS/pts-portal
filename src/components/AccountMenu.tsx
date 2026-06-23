"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLang } from "@/components/LangProvider";
import { signOutAction } from "@/lib/auth-actions";

// The owner header's account control: avatar + email, opening a small menu with a
// link to the Account & profile page and a Sign out button. Closes on outside
// click or Escape. Labels translate with the active UI language.
export default function AccountMenu({ email, owner }: { email: string; owner: boolean }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = (email.split("@")[0] || "?").slice(0, 2).toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          border: "1px solid var(--line)", borderRadius: 999, padding: "3px 10px 3px 3px",
          background: "#fff", color: "var(--ink)", fontSize: 13,
        }}
      >
        <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--green-light)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{initials}</span>
        <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>▾</span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, width: 250, zIndex: 50,
            background: "#fff", color: "var(--ink)", borderRadius: 12, border: "1px solid var(--line)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.18)", padding: 12,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{t("account.signedInAs")}</div>
          <div style={{ fontSize: 13, fontWeight: 700, margin: "1px 0 6px", wordBreak: "break-all" }}>{email}</div>
          <div style={{ fontSize: 12, color: owner ? "var(--green-dark)" : "var(--red)", marginBottom: 10 }}>
            {owner ? t("account.role.owner") : t("account.role.notOwner")}
          </div>
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            <Link href="/account" role="menuitem" onClick={() => setOpen(false)} className="no-underline" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, padding: "8px 8px", borderRadius: 8, color: "var(--ink)" }}>
              <span aria-hidden style={{ fontSize: 15 }}>⚙</span> {t("account.andProfile")}
            </Link>
            <form action={signOutAction}>
              <button type="submit" role="menuitem" style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, fontSize: 13, padding: "8px 8px", borderRadius: 8, color: "var(--red)", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span aria-hidden style={{ fontSize: 15 }}>⏻</span> {t("common.signOut")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
