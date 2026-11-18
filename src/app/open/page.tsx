import Link from "next/link";
import { safeNext } from "@/lib/auth-links";
import { ACTS_WHEN_OPENED } from "@/lib/acts-when-opened";
import { getServerT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

// After sign-in from a link to a page that acts when opened (an export, names with codes): the link,
// offered — never opened by itself in the person's name, never lost (round 7, Q3). Only a path of this
// portal, and only such a page; anything else goes home.
export default async function OpenPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const to = safeNext((await searchParams).to, "/");
  const path = to.split(/[?#]/)[0];
  const offered = to !== "/" && path !== "/open" && ACTS_WHEN_OPENED.test(path) ? to : null;
  return (
    <main style={{ maxWidth: 560, margin: "12vh auto", padding: "0 16px" }}>
      <h1 className="section-title ui-h1" style={{ margin: "0 0 10px" }}>{L("Входът е успешен", "Signed in")}</h1>
      {offered ? (
        <>
          <p>{L("Връзката, с която влязохте, отваря страница или файл, чието отваряне се записва. Продължете, ако сте я поискали.", "The link you signed in from opens a page or file whose opening is recorded. Continue if you asked for it.")}</p>
          <p data-open-to style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, wordBreak: "break-all", color: "var(--muted)" }}>{offered}</p>
          <p style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {/* a plain link: many of these are files and exports — a Next <Link> would fetch, then open them (twice in the journal, RV7-3) */}
            <a href={offered} className="btn btn-primary" data-open-continue>{L("Продължи", "Continue")}</a>
            <Link href="/" className="btn">{L("Към началото", "Home")}</Link>
          </p>
        </>
      ) : (
        <p><Link href="/" className="btn btn-primary">{L("Към началото", "Home")}</Link></p>
      )}
    </main>
  );
}
