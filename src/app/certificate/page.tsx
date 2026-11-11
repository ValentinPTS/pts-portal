import { getServerT } from "@/lib/i18n-server";
import CertificateLookup from "@/components/CertificateLookup";

export const dynamic = "force-dynamic";

// The certificate register's lookup — the portal's page (plan part 10.4; D20 option B; Реш. 55, 56, 115):
// the certificates the portal issues, checked by their number AND code. A QR code's link fills the number
// (`?no=…`); the code is typed by its holder and never read from a link. No list, no search by part of a
// number — one whole query, «valid» or «invalid».
export default async function CertificatePage({ searchParams }: { searchParams: Promise<{ no?: string }> }) {
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const no = String((await searchParams).no ?? "").slice(0, 60);
  return (
    <div data-certificate-page>
      <h1 className="text-3xl font-bold text-center">{L("Проверка на сертификат", "Check a certificate")}</h1>
      <p className="text-center mt-2 mx-auto" style={{ color: "#aab59c", maxWidth: 620 }}>
        {L("Сертификатите, които издава порталът на PTS: въведете номера и кода на лабораторията от сертификата. Отговорът е «валиден» или «невалиден».",
          "The certificates PTS's portal issues: type the number and the laboratory's code from the certificate. The answer is «valid» or «invalid».")}
      </p>
      <div className="mt-6"><CertificateLookup number={no} lang={lg} /></div>
      <p className="text-center text-sm mt-8" style={{ color: "#aab59c" }}>
        {L("По-старите сертификати — в регистъра на ", "Older certificates — in the register at ")}<a href="https://ptsbg.eu" target="_blank" rel="noopener" style={{ color: "var(--green-light)" }}>ptsbg.eu</a>.
      </p>
    </div>
  );
}
