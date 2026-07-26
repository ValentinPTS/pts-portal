import Link from "next/link";
import LanguageToggle from "@/components/LanguageToggle";
import { getServerT } from "@/lib/i18n-server";

// Dark, full-bleed public chrome for the lab-facing application flow — mirrors the
// look of the public ptsbg.eu site (dark green/black, light input fields).
export default async function ApplyLayout({ children }: { children: React.ReactNode }) {
  const { tr } = await getServerT();

  return (
    // flexGrow:1 fills the body's flex column (body is min-h-full flex-col), so the
    // dark background always covers the full document — no light body showing through
    // at the bottom, whatever the content height. (min-height:100vh on a flex child
    // alone can fall short and let body's #f9f9f9 peek out.)
    <div style={{ flexGrow: 1, minHeight: "100dvh", background: "#10140d", color: "#e7ece1" }}>
      <header className="mx-auto" style={{ maxWidth: 940, display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 0" }}>
        {/* back to the portal home — the apply area is public, so this is the only
            way out of the flow (the brand is a link too, by convention) */}
        <Link
          href="/"
          className="no-underline"
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "#1b2016", border: "1px solid #36422c", borderRadius: 999,
            padding: "7px 15px", color: "#cdd6c2", fontSize: 14, fontWeight: 600,
          }}
        >
          ← {tr("common.home")}
        </Link>
        <Link href="/" className="no-underline" style={{ fontWeight: 700, fontSize: 18, color: "#e7ece1" }}>
          PTS Bulgaria
        </Link>
        <span style={{ marginLeft: "auto" }}><LanguageToggle dark /></span>
      </header>
      <div className="mx-auto px-5 pb-10 pt-6" style={{ maxWidth: 940 }}>
        {children}
      </div>
    </div>
  );
}
