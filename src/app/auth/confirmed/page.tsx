import { getServerT } from "@/lib/i18n-server";

// Where an account e-mail link ends (part 1.5): the address is confirmed — or the
// link has expired or was used already, and what to do then.
export default async function ConfirmedPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const failed = !!(await searchParams).error;
  return (
    <div className="card p-6 mx-auto mt-12" style={{ maxWidth: 440 }} data-auth-landing={failed ? "error" : "ok"}>
      <h1 className="text-2xl font-bold" style={{ color: failed ? "var(--red)" : "var(--green-dark)" }}>
        {failed ? L("Връзката не важи", "This link is no longer valid") : L("Имейлът е потвърден", "Your e-mail is confirmed")}
      </h1>
      <p className="text-sm mt-2">
        {failed
          ? L("Връзката е изтекла или вече е използвана. За нова парола поискайте нова връзка; за покана или смяна на имейл се обърнете към PTS.", "The link has expired or was already used. For a new password, ask for a new link; for an invitation or an e-mail change, contact PTS.")
          : L("Вече можете да влезете.", "You can sign in now.")}
      </p>
      <div className="flex gap-3 mt-4 flex-wrap text-sm">
        {failed && <a className="btn btn-primary" href="/auth/forgot">{L("Нова парола", "A new password")}</a>}
        <a className="btn" href="/lab/login">{L("Вход за лаборатории", "Laboratory sign-in")}</a>
        <a className="btn" href="/login">{L("Вход за екипа на PTS", "PTS team sign-in")}</a>
      </div>
    </div>
  );
}
