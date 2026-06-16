import { redirect } from "next/navigation";
import Link from "next/link";
import { AUTH_ENABLED, getSessionUser, isOwnerEmail, createServerSupabase } from "@/lib/auth";
import { signOutAction } from "@/lib/auth-actions";
import TotpEnroll from "@/components/TotpEnroll";

export default async function AccountPage() {
  if (!AUTH_ENABLED) {
    return (
      <div className="card p-6 mt-6" style={{ maxWidth: 560 }}>
        <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>Account</h1>
        <p className="mt-2" style={{ color: "var(--muted)" }}>
          Authentication is currently <b>disabled</b> (AUTH_ENABLED is off), so there are no accounts yet.
          Set it up via <code>.env.example</code> when you’re ready, then this page manages your sign-in and 2FA.
        </p>
        <Link href="/" className="btn mt-4 inline-flex">← Back</Link>
      </div>
    );
  }

  const session = await getSessionUser();
  if (!session) redirect("/login");

  const supabase = await createServerSupabase();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasTotp = (factors?.totp ?? []).some((f) => f.status === "verified");
  const owner = isOwnerEmail(session.email);

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>Account</h1>
      <div className="card p-4 mt-4">
        <div className="text-sm" style={{ color: "var(--muted)" }}>Signed in as</div>
        <div className="font-bold">{session.email}</div>
        <div className="mt-2 text-sm">
          Role:{" "}
          <b style={{ color: owner ? "var(--success)" : "var(--red)" }}>{owner ? "Owner" : "Not an authorized owner"}</b>
        </div>
        <div className="text-sm">
          Two-factor:{" "}
          <b style={{ color: hasTotp ? "var(--success)" : "var(--amber)" }}>
            {hasTotp ? (session.aal2 ? "enabled ✓ (verified this session)" : "enabled ✓") : "not set up"}
          </b>
        </div>
      </div>

      {!hasTotp && (
        <div className="mt-5">
          <h2 className="text-lg font-bold" style={{ color: "var(--green-dark)" }}>Set up two-factor authentication</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Required before you can access the admin area.</p>
          <TotpEnroll />
        </div>
      )}

      <form action={signOutAction} className="mt-6">
        <button type="submit" className="btn">Sign out</button>
      </form>
    </div>
  );
}
