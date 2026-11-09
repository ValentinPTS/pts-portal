import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getServerT } from "@/lib/i18n-server";
import PasswordForm from "@/components/PasswordForm";
import PasswordTotpStep from "@/components/PasswordTotpStep";

export const dynamic = "force-dynamic";

// Set a password (part 1.5): after accepting an invitation, after a reset link, or
// when a temporary password from PTS must be replaced. The link that led here made
// the session (/auth/confirm); without one there is nothing to set.
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ from?: string; must?: string }> }) {
  const session = await getSessionUser();
  if (!session) redirect("/auth/confirmed?error=link");
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const { from = "", must } = await searchParams;
  return (
    <div className="card p-6 mx-auto mt-12" style={{ maxWidth: 440 }}>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>
        {from === "invite" ? L("Добре дошли — задайте парола", "Welcome — set a password") : L("Нова парола", "A new password")}
      </h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        {must
          ? L("Влязохте с временна парола от PTS. Задайте своя, преди да продължите.", "You signed in with a temporary password from PTS. Set your own before going on.")
          : L(`За ${session.email}.`, `For ${session.email}.`)}
      </p>
      {session.needsAal2 ? (
        <>
          <p className="text-sm mt-3">{L("Акаунтът ви има двуфакторна защита: първо въведете кода.", "Your account has two-factor protection: enter the code first.")}</p>
          <PasswordTotpStep from={must ? "must" : from} />
        </>
      ) : (
        <PasswordForm mode="set" from={must ? "must" : from} />
      )}
    </div>
  );
}
