import { getServerT } from "@/lib/i18n-server";

// Shown after a lab-account application is submitted (also the silent landing for
// honeypot/rate-limit drops, so an abuser learns nothing).
export default async function RegisterThanks() {
  const { lang } = await getServerT();
  const bg = lang === "bg";
  return (
    <div className="card p-8 mx-auto mt-10 text-center" style={{ maxWidth: 560 }}>
      <div style={{ fontSize: "2rem", color: "var(--green-light)", fontWeight: 800 }}>✓</div>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {bg ? "Заявката е получена" : "Application received"}
      </h1>
      <p className="mt-3" style={{ color: "var(--muted)", maxWidth: 460, margin: "12px auto 0" }}>
        {bg
          ? "Благодарим Ви. Екипът на PTS ще прегледа заявката и ще се свърже с Вас. Акаунт се създава едва след одобрение."
          : "Thank you. The PTS team will review your request and contact you. An account is created only after approval."}
      </p>
      <a href="/lab/login" className="btn btn-primary mt-7 inline-flex">
        {bg ? "Към входа за лаборатории" : "To laboratory sign-in"}
      </a>
    </div>
  );
}
