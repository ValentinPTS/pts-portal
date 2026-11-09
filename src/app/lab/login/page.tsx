import LoginForm from "@/components/LoginForm";

// Laboratory sign-in. Reuses the shared Supabase sign-in (email + password, 2FA if
// the lab enrolled one). `next` is constrained to the /lab area to avoid redirecting
// into the owner app. Light theme to match the redesigned app (soft green wash →
// the same green wordmark + PT Provider pill as the header).
export default async function LabLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string; invited?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/lab") ? sp.next : "/lab";
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, var(--green-soft), var(--bg) 260px)",
        display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 48 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 24, letterSpacing: "-0.01em" }}>
          <span style={{ color: "var(--green-dark)" }}>PTS</span> <span style={{ color: "var(--ink)" }}>Bulgaria</span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--green-light)", borderRadius: 999, padding: "3px 9px", letterSpacing: ".04em" }}>
          PT PROVIDER
        </span>
      </div>
      {/* a participant's invitation is accepted only through its e-mail's link (4.4) */}
      {sp.invited === "1" && (
        <p role="note" data-invited-note style={{ maxWidth: 420, marginTop: 24, fontSize: 14, background: "#fff8e6", border: "1px solid #ecd9a8", borderRadius: 8, padding: "10px 12px" }}>
          Поканата се приема само чрез връзката в писмото с поканата — отворете я отново (или поискайте нова парола). · The invitation is accepted only through the link in its e-mail — open it again (or ask for a new password).
        </p>
      )}
      <LoginForm next={next} audience="lab" denied={sp.denied === "1"} />
    </div>
  );
}
