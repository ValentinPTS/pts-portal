import LanguageToggle from "@/components/LanguageToggle";

// Dark, full-bleed public chrome for the lab-facing application flow — mirrors the
// look of the public ptsbg.eu site (dark green/black, light input fields).
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#10140d", color: "#e7ece1" }}>
      <header className="mx-auto" style={{ maxWidth: 940, display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 0" }}>
        <span style={{ fontWeight: 700, fontSize: 18 }}>PTS Bulgaria</span>
        <span style={{ marginLeft: "auto" }}><LanguageToggle dark /></span>
      </header>
      <div className="mx-auto px-5 pb-10 pt-6" style={{ maxWidth: 940 }}>
        {children}
      </div>
    </div>
  );
}
