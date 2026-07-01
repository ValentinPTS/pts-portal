import LanguageToggle from "@/components/LanguageToggle";

// Public "apply for a laboratory account" chrome. Light, matching the redesigned lab
// portal + /lab/login (soft green wash), so onboarding feels like one flow. No auth
// (the route is excluded from the proxy) — nothing here reveals internal data.
export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, var(--green-soft), var(--bg) 300px)",
        display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px 48px",
      }}
    >
      <header style={{ width: "100%", maxWidth: 720, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 22, letterSpacing: "-0.01em" }}>
          <span style={{ color: "var(--green-dark)" }}>PTS</span> <span style={{ color: "var(--ink)" }}>Bulgaria</span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--green-light)", borderRadius: 999, padding: "3px 9px", letterSpacing: ".04em" }}>
          PT PROVIDER
        </span>
        <span style={{ marginLeft: "auto" }}><LanguageToggle /></span>
      </header>
      <div style={{ width: "100%", maxWidth: 720 }}>{children}</div>
    </div>
  );
}
