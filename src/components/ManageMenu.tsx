"use client";

import { useState, useRef, useEffect } from "react";

// A small dropdown that tucks the scheme's secondary tools (Applications, Activity,
// Audit pack, rename/delete) behind one "Управление ▾" button, so the header shows
// only the primary actions. The menu content is passed as children by the page.
export default function ManageMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button className="btn" style={{ fontSize: 13 }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label} <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>▾</span>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, minWidth: 236,
            background: "#fff", border: "1px solid var(--line)", borderRadius: 12,
            boxShadow: "0 14px 38px rgba(15,30,22,.16)", padding: 8,
            display: "flex", flexDirection: "column", gap: 4,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
