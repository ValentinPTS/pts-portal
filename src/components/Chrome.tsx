"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/components/LangProvider";
import LanguageToggle from "@/components/LanguageToggle";
import AccountMenu from "@/components/AccountMenu";

type EffectiveRole = "manager" | "staff" | "auditor" | "lab";
type User = { email: string; role: EffectiveRole | null } | null;

// Splits the app chrome: the public application flow (/apply/*) renders full-bleed
// with its own (dark) layout; everything else gets the admin header + main.
// The folder-explorer pages (home, /files/*, a scheme's folder) render full-width
// (they provide their own sidebar + padding); other pages stay centered.
export default function Chrome({ user, canManageUsers, canViewActivity, children }: { user: User; canManageUsers?: boolean; canViewActivity?: boolean; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const { t } = useLang();
  // Public application flow + the laboratory portal render full-bleed with their
  // own (non-owner) headers — no admin chrome.
  if (path.startsWith("/apply") || path.startsWith("/lab")) return <>{children}</>;

  const explorer = path === "/" || path.startsWith("/files") || /^\/schemes\/[^/]+$/.test(path);
  const wide = path.includes("/build/") || path.startsWith("/skins/"); // skin editor needs room for two columns
  const onSkins = path.startsWith("/skins");
  const onItems = path.startsWith("/items");
  const onUsers = path.startsWith("/users");
  const onActivity = path.startsWith("/activity");

  const navLink = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className="no-underline"
      style={{
        padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: active ? 700 : 600,
        color: active ? "#456b2c" : "var(--muted)",
        background: active ? "#d9e6cc" : "transparent",
      }}
    >
      {label}
    </Link>
  );

  return (
    <>
      <header className="flex items-center gap-3 px-6 py-3" style={{ background: "#fff", borderBottom: "1px solid var(--line)", color: "var(--ink)" }}>
        <Link href="/" className="font-bold text-lg tracking-tight no-underline">
          <span style={{ color: "var(--green-dark)" }}>PTS</span> <span style={{ color: "var(--ink)" }}>Bulgaria</span>
        </Link>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--green-light)", borderRadius: 999, padding: "3px 9px", letterSpacing: ".04em" }}>PT PROVIDER</span>
        <nav className="ml-auto flex items-center gap-2">
          {navLink("/", t("nav.files"), explorer)}
          {navLink("/skins", t("nav.skins"), onSkins)}
          {navLink("/items", t("nav.items"), onItems)}
          {canViewActivity && navLink("/activity", t("nav.activity"), onActivity)}
          {canManageUsers && navLink("/users", t("nav.users"), onUsers)}
          <span style={{ width: 1, height: 22, background: "var(--line)", margin: "0 4px" }} />
          <LanguageToggle />
          {user && <AccountMenu email={user.email} role={user.role} />}
        </nav>
      </header>
      {user?.role === "auditor" && (
        <div style={{ background: "#fff7e6", borderBottom: "1px solid var(--amber)", color: "#8a6d00", fontSize: 12.5, fontWeight: 600, textAlign: "center", padding: "6px 12px" }}>
          {t("banner.auditorReadonly")}
        </div>
      )}
      <main className={explorer ? "flex-1 w-full flex flex-col" : `flex-1 w-full ${wide ? "max-w-7xl" : "max-w-5xl"} mx-auto px-6 py-8`}>
        {children}
      </main>
    </>
  );
}
