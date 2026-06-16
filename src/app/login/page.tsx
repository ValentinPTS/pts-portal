import { AUTH_ENABLED } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; denied?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "/";

  return (
    <div>
      <LoginForm next={next} denied={sp.denied === "1"} />
      {!AUTH_ENABLED && (
        <p className="text-center text-xs mt-4" style={{ color: "var(--muted)" }}>
          Authentication is currently disabled (AUTH_ENABLED is off) — the app is open. This page is for setup.
        </p>
      )}
    </div>
  );
}
