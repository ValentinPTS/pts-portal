import Link from "next/link";
import { getServerT } from "@/lib/i18n-server";

// One of PTS's people, signed in, asking for a page or an act their role does not have — said as such,
// never the sign-in page (the security sweep, UR-1: an auditor pressing a save landed on «Вход за
// организатор … не е оторизиран»). Nothing was changed.
export const dynamic = "force-dynamic";

export default async function DeniedPage() {
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  return (
    <div style={{ padding: 40, width: "100%" }}>
      <div data-denied className="state-box" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="state-ico" aria-hidden />
        <div className="state-title">{L("Нямате право на това", "You do not have the right to this")}</div>
        <div className="state-body">{L("Вашата роля не включва тази страница или това действие — нищо не е променено. Ако трябва да го имате, обърнете се към ръководителя на PTS.", "Your role does not include this page or this act — nothing was changed. If you should have it, ask the head of PTS.")}</div>
        <Link href="/" className="btn btn-sm">{L("Към началото", "To the start")}</Link>
      </div>
    </div>
  );
}
