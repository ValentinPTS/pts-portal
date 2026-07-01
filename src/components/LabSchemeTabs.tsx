"use client";

import { useState } from "react";

// Tabbed browser for the lab dashboard. Content for each tab is rendered on the
// server (all scheme data + confidentiality stays server-side) and passed in as
// nodes; this client shell only toggles which one is visible. Counts on each tab
// make empty buckets obvious at a glance.
export type LabTab = { key: string; label: string; count: number; content: React.ReactNode };

export default function LabSchemeTabs({ tabs }: { tabs: LabTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const cur = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div role="tablist" style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--line)", marginBottom: 18, flexWrap: "wrap" }}>
        {tabs.map((t) => {
          const on = t.key === cur?.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              style={{
                appearance: "none", background: "none", border: "none", cursor: "pointer",
                padding: "8px 14px", fontSize: 14.5, fontWeight: on ? 700 : 500,
                color: on ? "var(--green-dark)" : "var(--muted)",
                borderBottom: `2px solid ${on ? "var(--green-dark)" : "transparent"}`,
                marginBottom: -1, display: "inline-flex", alignItems: "center", gap: 7,
              }}
            >
              {t.label}
              <span style={{
                fontSize: 12, fontWeight: 700, lineHeight: 1,
                color: on ? "var(--green-dark)" : "var(--muted)",
                background: on ? "var(--green-soft)" : "var(--bg)",
                borderRadius: 999, padding: "3px 8px",
              }}>{t.count}</span>
            </button>
          );
        })}
      </div>
      <div>{cur?.content}</div>
    </div>
  );
}
