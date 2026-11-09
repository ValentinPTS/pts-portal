"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/components/LangProvider";
import { sectionOf, type Section } from "@/lib/admin-sections";

// The administrative panel's rail (plan part 2.7; PTS's design «10. Административен
// панел»): the sections this person may open, in the design's order — the work, then
// the records — and the portal's own pages under «Още». The server decides which
// (lib/admin-nav.ts); a section still to be built says so on its page.

export type RailSection = Pick<Section, "key" | "href" | "bg" | "en" | "group" | "comesIn">;

export default function AdminRail({ sections }: { sections: RailSection[] }) {
  const path = usePathname() ?? "";
  const { lang } = useLang();
  const active = sectionOf(path);
  const label = (s: RailSection) => (lang === "en" ? s.en : s.bg);
  const group = (g: RailSection["group"]) => sections.filter((s) => s.group === g);

  const item = (s: RailSection) => (
    <Link key={s.key} href={s.href} data-section={s.key} aria-current={active === s.key ? "page" : undefined}
      className={`adminrail-link${active === s.key ? " is-active" : ""}`}>
      <span>{label(s)}</span>
      {s.comesIn && (
        <span className="adminrail-soon" aria-hidden="true">{s.comesIn}</span>
      )}
      {s.comesIn && <span className="sr-only-pts">{lang === "en" ? ` — comes in part ${s.comesIn}` : ` — идва в част ${s.comesIn}`}</span>}
    </Link>
  );

  return (
    <aside className="adminrail" data-admin-rail aria-label={lang === "en" ? "Administrative panel" : "Административен панел"}>
      <Link href="/dashboard" className="adminrail-brand no-underline">
        <span className="adminrail-name">PTS Bulgaria</span>
        <span className="adminrail-sub">{lang === "en" ? "Administrative panel" : "Административен панел"}</span>
      </Link>
      <nav className="adminrail-nav" aria-label={lang === "en" ? "Sections" : "Раздели"}>
        {group("main").map(item)}
        {group("records").length > 0 && <hr className="adminrail-rule" />}
        {group("records").map(item)}
        {group("more").length > 0 && (
          <>
            <hr className="adminrail-rule" />
            <span className="adminrail-label">{lang === "en" ? "More" : "Още"}</span>
            {group("more").map(item)}
          </>
        )}
      </nav>
    </aside>
  );
}
