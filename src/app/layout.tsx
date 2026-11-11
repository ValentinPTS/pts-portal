import type { Metadata } from "next";
import { mayAnywhereNow, getViewer, schemesFor } from "@/lib/access";
import { Open_Sans, PT_Serif } from "next/font/google";
import "./globals.css";
import Chrome from "@/components/Chrome";
import { LangProvider } from "@/components/LangProvider";
import { getUiLang } from "@/lib/i18n-server";
import { getSessionUser, REQUIRE_2FA } from "@/lib/auth";
import { getRoleContext, canManagePeople } from "@/lib/roles";
import { listForProvider, withReadState, readerKey } from "@/lib/notifications";
import { isTestEnvironment } from "@/lib/environment";
import { visibleSections } from "@/lib/admin-nav";

// App UI — Open Sans (the ptsbg.eu website font, incl. Cyrillic). Documents keep
// their own formal fonts (PT Serif + Sofia Sans Condensed, loaded in the renderer).
const openSans = Open_Sans({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});
// Document body serif — PT Serif (incl. Cyrillic)
const ptSerif = PT_Serif({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PTS Bulgaria — Portal",
  description: "Proficiency Testing Solutions Bulgaria — provider portal",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const lang = await getUiLang();
  const ctx = await getRoleContext();
  const session = await getSessionUser();
  const user = session ? { email: session.email, role: ctx.role } : null;
  // Managers (incl. build mode, where there's no session yet) see the Users link —
  // and the head of the PT provider, who manages PTS's people there (2.2)
  // (a session still owing its new password or its second factor: nothing — the security sweep, SA-3)
  const settled = !ctx.authEnabled || (!ctx.mustChangePassword && (!REQUIRE_2FA || ctx.aal2 || ctx.role === "lab"));
  const managesPeople = settled && (await canManagePeople(ctx));
  const canManageUsers = (await mayAnywhereNow("labs.manage")) || managesPeople;
  // the administrative panel's sections this person may open (2.7)
  // — only for one of PTS: signed in and not a laboratory (with login off, the local
  // build and its personas). A signed-out visitor or a laboratory resetting a password
  // on /auth/* gets no panel.
  const ofPts = ctx.authEnabled ? settled && !!ctx.email && !!ctx.role && ctx.role !== "lab" : ctx.role !== "lab";
  const sections = ofPts ? visibleSections(await getViewer(), managesPeople).map(({ key, href, bg, en, group, comesIn }) => ({ key, href, bg, en, group, comesIn })) : [];
  // Any internal role (manager / staff / auditor) sees the Activity log; labs don't.
  const canViewActivity = await mayAnywhereNow("journal.read"); // the role model (2.4)
  // The provider's notification feed. Fetched only for internal roles, so a public
  // visitor on /apply or /register never pays for a query they can't see.
  // A new заявка is a manager's to open (the applications page names the lab), so
  // other internal roles don't get a notice that only leads to a refusal.
  // The bell is never worth the page: a failed read shows an empty feed, logged —
  // without this one database blip in the header would take down every page (1.1).
  // …and only of the schemes this person works in: a notice carries a code (2.4)
  const scope = schemesFor(await getViewer(), "codes.view");
  // read as THIS person read it — not cleared for everyone by one (4.6, N28)
  const notifications = canViewActivity
    ? await withReadState((await listForProvider(30).catch((e) => { console.error("[layout] notification feed:", (e as Error)?.message ?? e); return []; }))
        .filter((n) => canManageUsers || n.kind !== "application.received")
        .filter((n) => scope === "all" || (!!n.schemeId && scope.includes(n.schemeId))), readerKey.staff(ctx.email ?? "build")).catch(() => [])
    : [];

  return (
    <html lang={lang} className={`${openSans.variable} ${ptSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LangProvider initial={lang}>
          {isTestEnvironment() && (
            // the test environment says so on every page, staff and laboratory alike (1.2)
            <div data-test-env role="note" style={{ position: "sticky", top: 0, zIndex: 60, background: "#7a2e0e", color: "#fff", fontSize: 13, fontWeight: 700, padding: "6px 16px", textAlign: "center", letterSpacing: ".02em" }}>
              {lang === "bg"
                ? "ТЕСТОВА СРЕДА — тук няма истински данни. Не въвеждайте истински лаборатории и хора."
                : "TEST ENVIRONMENT — nothing here is real. Do not enter real laboratories or people."}
            </div>
          )}
          {ctx.persona && (
            // development persona strip — never rendered in production (see lib/roles.ts)
            <div style={{ background: "#fdf6e3", borderBottom: "1px solid #e6d9a8", color: "#7a5c00", fontSize: 12, padding: "4px 16px", display: "flex", gap: 12, flexWrap: "wrap" }}>
              <b>DEV · {ctx.role}</b>
              {(["manager", "staff", "auditor", "lab"] as const).map((r) => (
                <a key={r} href={`/dev/persona?role=${r}`} style={{ textDecoration: "underline" }}>{r}</a>
              ))}
              <a href="/dev/persona" style={{ textDecoration: "underline" }}>off</a>
            </div>
          )}
          <Chrome user={user} sections={sections} canViewActivity={canViewActivity} notifications={notifications}>{children}</Chrome>
        </LangProvider>
      </body>
    </html>
  );
}
