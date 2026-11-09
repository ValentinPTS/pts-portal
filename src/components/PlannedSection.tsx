import Link from "next/link";
import { getServerT } from "@/lib/i18n-server";
import { SECTIONS, type SectionKey } from "@/lib/admin-nav";

// A section of the administrative panel that a later part builds (plan part 2.7): it
// says what it will hold, which part brings it, and where that work is done meanwhile
// — never an empty page that looks broken.
export default async function PlannedSection({ section, will, meanwhile }: {
  section: SectionKey;
  will: { bg: string; en: string };
  meanwhile: { bg: string; en: string; href: string; link: { bg: string; en: string } };
}) {
  const { lang } = await getServerT();
  const L = (x: { bg: string; en: string }) => (lang === "en" ? x.en : x.bg);
  const s = SECTIONS.find((x) => x.key === section)!;
  return (
    <div data-planned-section={section} style={{ maxWidth: 680 }}>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)", textWrap: "balance" }}>{L(s)}</h1>
      <p className="mt-2" style={{ color: "var(--ink)", lineHeight: 1.55 }}>{L(will)}</p>
      <div className="card mt-5" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
          {lang === "en" ? `Comes in part ${s.comesIn} of the plan` : `Идва в част ${s.comesIn} от плана`}
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--ink)", lineHeight: 1.55 }}>{L(meanwhile)}</p>
        <Link href={meanwhile.href} className="btn mt-3" style={{ display: "inline-block", fontSize: 13 }}>{L(meanwhile.link)} →</Link>
      </div>
    </div>
  );
}
