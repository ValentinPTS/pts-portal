import { redirect } from "next/navigation";
import { getServerT } from "@/lib/i18n-server";
import { acceptLinkAction } from "@/lib/auth-actions";
import { isOtpType } from "@/lib/auth-links";

export const dynamic = "force-dynamic";

// Where every account e-mail link lands (plan part 1.5, P4.b) — an invitation, a
// password reset, an e-mail confirmation or change. Opening it does NOTHING: a mail
// scanner that opens every link spends no token, and no other site can sign a
// visitor in silently. The person presses «Продължи»; that POST (a server action,
// which Next refuses from another origin) exchanges the token on the server.
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const kind = q.type;
  const usable = (q.token_hash && isOtpType(kind)) || !!q.code;
  if (!usable) redirect("/auth/confirmed?error=link");
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const what =
    kind === "invite" ? L("Приемане на поканата за портала на PTS Bulgaria.", "Accepting the invitation to the PTS Bulgaria portal.")
    : kind === "recovery" ? L("Нова парола за вашия акаунт.", "A new password for your account.")
    : L("Потвърждение на имейл адреса.", "Confirming the e-mail address.");
  return (
    <div className="card p-6 mx-auto mt-12" style={{ maxWidth: 440 }} data-auth-continue>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Продължете", "Continue")}</h1>
      <p className="text-sm mt-2">{what}</p>
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        {L("Ако не сте поискали това, просто затворете страницата.", "If you did not ask for this, simply close the page.")}
      </p>
      <form action={acceptLinkAction} className="mt-4">
        <input type="hidden" name="token_hash" value={q.token_hash ?? ""} />
        <input type="hidden" name="type" value={kind ?? ""} />
        <input type="hidden" name="code" value={q.code ?? ""} />
        <input type="hidden" name="next" value={q.next ?? ""} />
        <button type="submit" className="btn btn-primary">{L("Продължи", "Continue")}</button>
      </form>
    </div>
  );
}
