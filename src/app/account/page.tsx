import { redirect } from "next/navigation";
import Link from "next/link";
import { AUTH_ENABLED, getSessionUser, isOwnerEmail, createServerSupabase } from "@/lib/auth";
import { signOutAction } from "@/lib/auth-actions";
import TotpEnroll from "@/components/TotpEnroll";
import BackLink from "@/components/BackLink";
import { getServerT } from "@/lib/i18n-server";

export default async function AccountPage() {
  const { tr } = await getServerT();

  if (!AUTH_ENABLED) {
    return (
      <div className="card p-6 mt-6" style={{ maxWidth: 560 }}>
        <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{tr("account.title")}</h1>
        <p className="mt-2" style={{ color: "var(--muted)" }}>
          Authentication is currently <b>disabled</b> (AUTH_ENABLED is off), so there are no accounts yet.
          Set it up via <code>.env.example</code> when you’re ready, then this page manages your sign-in and 2FA.
        </p>
        <Link href="/" className="btn mt-4 inline-flex">← {tr("common.back")}</Link>
      </div>
    );
  }

  const session = await getSessionUser();
  if (!session) redirect("/login");

  const supabase = await createServerSupabase();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasTotp = (factors?.totp ?? []).some((f) => f.status === "verified");
  const owner = isOwnerEmail(session.email);
  const twoFactorValue = hasTotp
    ? session.aal2
      ? tr("account.twoFactor.thisSession")
      : tr("account.twoFactor.enabled")
    : tr("account.twoFactor.notSetUp");

  return (
    <div style={{ maxWidth: 560 }}>
      <BackLink href="/" />
      <h1 className="text-2xl font-bold mt-3" style={{ color: "var(--green-dark)" }}>{tr("account.title")}</h1>
      <div className="card p-4 mt-4">
        <div className="text-sm" style={{ color: "var(--muted)" }}>{tr("account.signedInAs")}</div>
        <div className="font-bold">{session.email}</div>
        <div className="mt-2 text-sm">
          {tr("account.role")}:{" "}
          <b style={{ color: owner ? "var(--success)" : "var(--red)" }}>{owner ? tr("account.role.owner") : tr("account.role.notOwner")}</b>
        </div>
        <div className="text-sm">
          {tr("account.twoFactor")}:{" "}
          <b style={{ color: hasTotp ? "var(--success)" : "var(--amber)" }}>{twoFactorValue}</b>
        </div>
      </div>

      {!hasTotp && (
        <div className="mt-5">
          <h2 className="text-lg font-bold" style={{ color: "var(--green-dark)" }}>{tr("account.setup2faTitle")}</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{tr("account.setup2faHint")}</p>
          <TotpEnroll />
        </div>
      )}

      <form action={signOutAction} className="mt-6">
        <button type="submit" className="btn">{tr("common.signOut")}</button>
      </form>
    </div>
  );
}
