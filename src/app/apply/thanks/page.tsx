import Link from "next/link";
import { getServerT } from "@/lib/i18n-server";

export default async function ApplyThanks({ searchParams }: { searchParams: Promise<{ later?: string }> }) {
  const { tr, lang } = await getServerT();
  // everyone's ceiling of the public form reached: said, never thanked for what was not taken (R2S-4)
  if ((await searchParams).later === "1") return (
    <div className="text-center" data-apply-later style={{ paddingTop: 40 }}>
      <h1 className="text-3xl font-bold mt-3">{lang === "bg" ? "Опитайте след малко" : "Try again in a while"}</h1>
      <p className="mt-3" style={{ color: "#cdd6c2", maxWidth: 560, margin: "12px auto 0" }}>{lang === "bg" ? "В момента има твърде много заявки — заявката ви НЕ е приета. Опитайте отново след около час." : "There are too many applications right now — yours was NOT received. Try again in about an hour."}</p>
      <Link href="/apply" className="btn btn-primary mt-7 inline-flex">{tr("apply.toOpen")}</Link>
    </div>
  );
  return (
    <div className="text-center" style={{ paddingTop: 40 }}>
      <div style={{ fontSize: "2.5rem", color: "var(--green-light)" }}>✓</div>
      <h1 className="text-3xl font-bold mt-3">{tr("apply.thanksTitle")}</h1>
      <p className="mt-3" style={{ color: "#cdd6c2", maxWidth: 560, margin: "12px auto 0" }}>
        {tr("apply.thanksBody")}
      </p>
      <Link href="/apply" className="btn btn-primary mt-7 inline-flex">
        {tr("apply.toOpen")}
      </Link>
    </div>
  );
}
