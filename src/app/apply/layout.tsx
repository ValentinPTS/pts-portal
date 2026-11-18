import Link from "next/link";
import LanguageToggle from "@/components/LanguageToggle";
import { getServerT } from "@/lib/i18n-server";

// Full-bleed public chrome for the public pages (the application flow, the catalogue, the registration, the
// certificate lookup). The redesign (R2): light, as ptsbg.eu is today — white, green and orange (it was dark).
export default async function ApplyLayout({ children }: { children: React.ReactNode }) {
  const { tr } = await getServerT();

  return (
    // flexGrow:1 fills the body's flex column (body is min-h-full flex-col), so the
    // background always covers the full document — no light body showing through
    // at the bottom, whatever the content height. (min-height:100vh on a flex child
    // alone can fall short and let body's #f9f9f9 peek out.)
    <div style={{ flexGrow: 1, minHeight: "100dvh", background: "#ffffff", color: "#3e3e3e" }}>
      <header className="mx-auto" style={{ maxWidth: 940, display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 0" }}>
        {/* back to the portal home — the apply area is public, so this is the only
            way out of the flow (the brand is a link too, by convention) */}
        <Link
          href="/"
          className="no-underline"
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "#ffffff", border: "1px solid #e3e9de", borderRadius: 999,
            padding: "7px 15px", color: "#456b2c", fontSize: 14, fontWeight: 600,
          }}
        >
          ← {tr("common.home")}
        </Link>
        <Link href="/" className="no-underline" style={{ fontWeight: 700, fontSize: 18, color: "#3e3e3e" }}>
          PTS Bulgaria
        </Link>
        <span style={{ marginLeft: "auto" }}><LanguageToggle /></span>
      </header>
      <div className="mx-auto px-5 pb-10 pt-6" style={{ maxWidth: 940 }}>
        {children}
      </div>
    </div>
  );
}
