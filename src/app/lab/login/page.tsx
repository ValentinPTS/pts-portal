import LoginForm from "@/components/LoginForm";

// Laboratory sign-in. Reuses the shared Supabase sign-in (email + password, 2FA if
// the lab enrolled one). `next` is constrained to the /lab area to avoid redirecting
// into the owner app.
export default async function LabLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/lab") ? sp.next : "/lab";
  return (
    <div style={{ minHeight: "100dvh", background: "#173a26", display: "flex", flexDirection: "column", padding: "24px 16px" }}>
      <div style={{ textAlign: "center", color: "#fff", fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 22, letterSpacing: ".3px", marginTop: 24 }}>
        PTS Bulgaria
      </div>
      <LoginForm next={next} audience="lab" denied={sp.denied === "1"} />
    </div>
  );
}
