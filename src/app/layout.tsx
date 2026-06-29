import type { Metadata } from "next";
import { Open_Sans, PT_Serif } from "next/font/google";
import "./globals.css";
import Chrome from "@/components/Chrome";
import { LangProvider } from "@/components/LangProvider";
import { getUiLang } from "@/lib/i18n-server";
import { getSessionUser } from "@/lib/auth";
import { getRoleContext } from "@/lib/roles";

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
  // Managers (incl. build mode, where there's no session yet) see the Users link.
  const canManageUsers = ctx.role === "manager";
  // Any internal role (manager / staff / auditor) sees the Activity log; labs don't.
  const canViewActivity = !!ctx.role && ctx.role !== "lab";

  return (
    <html lang={lang} className={`${openSans.variable} ${ptSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LangProvider initial={lang}>
          <Chrome user={user} canManageUsers={canManageUsers} canViewActivity={canViewActivity}>{children}</Chrome>
        </LangProvider>
      </body>
    </html>
  );
}
