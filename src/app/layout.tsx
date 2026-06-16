import type { Metadata } from "next";
import { Sofia_Sans_Condensed, PT_Serif } from "next/font/google";
import "./globals.css";
import Chrome from "@/components/Chrome";

// Headings / UI — Sofia Sans Condensed (brand display font, variable, incl. Cyrillic)
const sofia = Sofia_Sans_Condensed({
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sofia.variable} ${ptSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Chrome>{children}</Chrome>
      </body>
    </html>
  );
}
