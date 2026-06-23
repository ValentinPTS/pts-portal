import type { Metadata } from "next";
import { Open_Sans, PT_Serif } from "next/font/google";
import "./globals.css";
import Chrome from "@/components/Chrome";
import { LangProvider } from "@/components/LangProvider";
import { getUiLang } from "@/lib/i18n-server";
import { getSessionUser, isOwnerEmail } from "@/lib/auth";

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
  const session = await getSessionUser();
  const user = session ? { email: session.email, owner: isOwnerEmail(session.email) } : null;

  return (
    <html lang={lang} className={`${openSans.variable} ${ptSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LangProvider initial={lang}>
          <Chrome user={user}>{children}</Chrome>
        </LangProvider>
      </body>
    </html>
  );
}
