import { AUTH_ENABLED } from "@/lib/auth";
import { safeNext } from "@/lib/auth-links";
import LoginForm from "@/components/LoginForm";
import LanguageToggle from "@/components/LanguageToggle";

// Team (Manager/Staff/Auditor) sign-in. Standalone page — no admin chrome (excluded
// in Chrome.tsx). Light green wash + wordmark + language toggle, matching /lab/login
// and /register so all three entry points feel like one family.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; denied?: string }>;
}) {
  const sp = await searchParams;
  // the security sweep (SA-2): never a backslash or a control character — another site to a browser
  const next = safeNext(sp.next, "/");

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, var(--green-soft), var(--bg) 260px)",
        display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px",
      }}
    >
      <header style={{ width: "100%", maxWidth: 420, display: "flex", alignItems: "center", gap: 10, marginTop: 24 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 22, letterSpacing: "-0.01em" }}>
          <span style={{ color: "var(--green-dark)" }}>PTS</span> <span style={{ color: "var(--ink)" }}>Bulgaria</span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--green-light)", borderRadius: 999, padding: "3px 9px", letterSpacing: ".04em" }}>PT PROVIDER</span>
        <span style={{ marginLeft: "auto" }}><LanguageToggle /></span>
      </header>
      <LoginForm next={next} denied={sp.denied === "1"} />
      {!AUTH_ENABLED && (
        <p className="text-center text-xs mt-4" style={{ color: "var(--muted)", maxWidth: 420 }}>
          Влизането е изключено (AUTH_ENABLED не е включено) — порталът е отворен; тази страница е за настройка. · Authentication is currently disabled (AUTH_ENABLED is off) — the app is open. This page is for setup.
        </p>
      )}
    </div>
  );
}
