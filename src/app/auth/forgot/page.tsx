import { getServerT } from "@/lib/i18n-server";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

// «Забравена парола?» from either sign-in page (part 1.5).
export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const back = (await searchParams).area === "lab" ? "/lab/login" : "/login";
  return (
    <div className="card p-6 mx-auto mt-12" style={{ maxWidth: 420 }}>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Забравена парола", "Forgotten password")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        {L("Въведете имейла, с който влизате. Ще получите връзка за нова парола.", "Enter the e-mail you sign in with. You will get a link for a new password.")}
      </p>
      <ForgotPasswordForm back={back} />
    </div>
  );
}
