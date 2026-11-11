import Link from "next/link";
import { getServerT } from "@/lib/i18n-server";

// The portal's own «not found» (the security sweep, UP-2): a stale link, an unknown scheme, a scheme
// not started (Реш. 147 — the same words as an unknown one, so nothing tells them apart) — in the
// portal's words and languages, with a way back, never the framework's bare English box.
export default async function NotFound() {
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  return (
    <div style={{ padding: 40, width: "100%" }}>
      <div data-not-found className="state-box" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="state-ico" aria-hidden />
        <div className="state-title">{L("Страницата не е намерена", "Page not found")}</div>
        <div className="state-body">{L("Връзката е стара или адресът е сгрешен.", "The link is out of date or the address is mistyped.")}</div>
        <div className="flex gap-2 flex-wrap justify-center">
          <Link href="/catalogue" className="btn btn-primary btn-sm">{L("Каталог на схемите", "Catalogue of schemes")}</Link>
          <Link href="/" className="btn btn-sm">{L("Начало", "Home")}</Link>
        </div>
      </div>
    </div>
  );
}
