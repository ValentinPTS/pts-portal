import LanguageToggle from "@/components/LanguageToggle";

// Dark, full-bleed public chrome for the lab-facing application flow — mirrors the
// look of the public ptsbg.eu site (dark green/black, light input fields).
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    // flexGrow:1 fills the body's flex column (body is min-h-full flex-col), so the
    // dark background always covers the full document — no light body showing through
    // at the bottom, whatever the content height. (min-height:100vh on a flex child
    // alone can fall short and let body's #f9f9f9 peek out.)
    <div style={{ flexGrow: 1, minHeight: "100dvh", background: "#10140d", color: "#e7ece1" }}>
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
