import Link from "next/link";
import { getServerT } from "@/lib/i18n-server";

export default async function ApplyThanks() {
  const { tr } = await getServerT();
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
