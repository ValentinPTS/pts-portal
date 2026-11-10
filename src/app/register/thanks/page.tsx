import { getServerT } from "@/lib/i18n-server";

// After a registration (plan part 9.1) — the same page, the same words, whatever happened: a new
// organisation, a request to join an existing one, a repeated e-mail, a dropped submission (the
// honeypot, the limit). Whether the organisation, the e-mail or the ЕИК exist is never said.
export default async function RegisterThanks() {
  const { lang } = await getServerT();
  const bg = lang === "bg";
  return (
    <div className="card p-8 mx-auto mt-10 text-center" style={{ maxWidth: 560 }} data-register-thanks>
      <div style={{ fontSize: "2rem", color: "var(--green-light)", fontWeight: 800 }}>✓</div>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {bg ? "Регистрацията е получена" : "Registration received"}
      </h1>
      <p className="mt-3" style={{ color: "var(--muted)", maxWidth: 460, margin: "12px auto 0" }}>
        {bg
          ? "Благодарим Ви. Регистрацията ще бъде прегледана. Когато бъде одобрена, ще получите писмо на e-mail адреса за вход. Профил и вход се създават едва след одобрение."
          : "Thank you. The registration will be reviewed. When it is approved, you will receive an e-mail at your login address. A profile and a sign-in are made only after approval."}
      </p>
      <a href="/lab/login" className="btn btn-primary mt-7 inline-flex">
        {bg ? "Към входа за лаборатории" : "To laboratory sign-in"}
      </a>
    </div>
  );
}
