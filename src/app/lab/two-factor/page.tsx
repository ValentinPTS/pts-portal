import { redirect } from "next/navigation";
import { getParticipantSignIn } from "@/lib/participant-session";
import { getServerT } from "@/lib/i18n-server";
import { signOutLabAction } from "@/lib/auth-actions";
import TotpEnroll from "@/components/TotpEnroll";

export const dynamic = "force-dynamic";

// Two-step sign-in for a participant's user (plan part 4.3–4.4, Реш. 95): when PTS
// requires it and this session has not passed it, the user sets an authenticator up
// here first — nothing else is open to it. Optional otherwise.
export default async function ParticipantTwoFactorPage() {
  const s = await getParticipantSignIn();
  if (!s) redirect("/lab/login");
  if (!s.twoStepMissing) redirect("/lab/confirm");
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <header className="flex items-center gap-3 px-6 py-3" style={{ background: "#fff", borderBottom: "1px solid var(--line)", color: "var(--ink)" }}>
        <span className="font-bold text-lg tracking-tight"><span style={{ color: "var(--green-dark)" }}>PTS</span> Bulgaria</span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>· {L("Портал за участници", "Participant portal")}</span>
        <form action={signOutLabAction} style={{ marginLeft: "auto" }}><button type="submit" className="btn btn-sm">{L("Изход", "Sign out")}</button></form>
      </header>
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "32px 24px" }} data-two-step-required>
        <h1 className="section-title" style={{ fontSize: 24, margin: "0 0 8px" }}>{L("Влизане в две стъпки", "Two-step sign-in")}</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {L("PTS изисква за вашия профил влизане в две стъпки. Настройте приложение за удостоверяване, преди да продължите.",
             "PTS requires two-step sign-in for your profile. Set an authenticator app up before you go on.")}
        </p>
        <TotpEnroll after="/lab/confirm" />
      </main>
    </div>
  );
}
