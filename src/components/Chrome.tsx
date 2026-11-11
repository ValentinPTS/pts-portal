"use client";

import { usePathname } from "next/navigation";
import { useLang } from "@/components/LangProvider";
import LanguageToggle from "@/components/LanguageToggle";
import AccountMenu from "@/components/AccountMenu";
import NotificationBell from "@/components/NotificationBell";
import type { Notification } from "@/lib/types";
import AdminRail, { type RailSection } from "@/components/AdminRail";

type EffectiveRole = "manager" | "staff" | "auditor" | "lab";
type User = { email: string; role: EffectiveRole | null } | null;

// Splits the app chrome: the public application flow (/apply/*) renders full-bleed
// with its own (dark) layout; everything else gets the administrative panel (2.7).
// The folder-explorer pages (home, /files/*, a scheme's folder) render full-width
// (they provide their own sidebar + padding); other pages stay centered.
export default function Chrome({ user, sections = [], canViewActivity, notifications = [], children }: { user: User; sections?: RailSection[]; canViewActivity?: boolean; notifications?: Notification[]; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const { t } = useLang();
  // Public/auth flows render full-bleed with their own (non-owner) headers — no admin
  // chrome: the scheme-application flow (/apply), the lab portal (/lab, incl.
  // /lab/login), the team sign-in (/login), the lab-account application (/register) and the
  // public catalogue (/catalogue, 10.1).
  if (
    path.startsWith("/apply") || path.startsWith("/lab") ||
    path.startsWith("/login") || path.startsWith("/register") ||
    path === "/catalogue" || path.startsWith("/catalogue/") // the public catalogue (10.1)
  ) {
    return <>{children}</>;
  }

  const explorer = path === "/" || path.startsWith("/files") || /^\/schemes\/[^/]+$/.test(path);
  const wide = path.includes("/build/") || path.startsWith("/skins/"); // skin editor needs room for two columns

  // the administrative panel (2.7): its sections on the rail, the page beside it; the
  // bar above the page keeps the notices, the language and the account. No rail for
  // one who is not of PTS (signed out, or a laboratory on /auth/*); on the wide
  // editor pages the rail is a bar along the top — the A4 sheet needs the width.
  return (
    <div className={`adminshell${wide ? " is-bar" : ""}`}>
      <a href="#content" className="skip-link">{t("a11y.skip")}</a>
      {sections.length > 0 && <AdminRail sections={sections} />}
      <div className="adminmain">
        <header className="flex items-center gap-3 px-6 py-2.5" style={{ background: "#fff", borderBottom: "1px solid var(--line)", color: "var(--ink)" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--green-light)", borderRadius: 999, padding: "3px 9px", letterSpacing: ".04em" }}>PT PROVIDER</span>
          <div className="ml-auto flex items-center gap-2">
            {canViewActivity && <NotificationBell items={notifications} />}
            <LanguageToggle />
            {user && <AccountMenu email={user.email} role={user.role} />}
          </div>
        </header>
        {user?.role === "auditor" && (
          <div style={{ background: "#fff7e6", borderBottom: "1px solid var(--amber)", color: "#8a6d00", fontSize: 12.5, fontWeight: 600, textAlign: "center", padding: "6px 12px" }}>
            {t("banner.auditorReadonly")}
          </div>
        )}
        <main id="content" className={explorer ? "flex-1 w-full flex flex-col" : `flex-1 w-full ${wide ? "max-w-7xl" : "max-w-5xl"} mx-auto px-6 py-8`}>
          {children}
        </main>
      </div>
    </div>
  );
}
