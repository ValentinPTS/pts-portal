import Link from "next/link";
import { listSchemeSummaries, listSchemesByYear } from "@/lib/store";
import { FolderIcon, FileIcon, HomeIcon, GridIcon } from "@/components/FileIcons";
import { TYPE_SLUG, typeLabel, schemeName, yearsForType, schemesIn, ACCENT, type FolderType } from "@/lib/folders";

type Active = { type?: FolderType; year?: string; schemeId?: string };

function Row({
  href, label, depth = 0, chevron, icon, active = false, bold = false,
}: {
  href: string; label: string; depth?: number; chevron?: "▾" | "▸" | null; icon?: React.ReactNode; active?: boolean; bold?: boolean;
}) {
  return (
    <Link href={href} className="no-underline" style={{
      display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", paddingLeft: 10 + depth * 16,
      borderRadius: 8, background: active ? "var(--green-soft)" : "transparent",
      color: active ? "var(--green-dark)" : "var(--ink)", fontWeight: active || bold ? 700 : 500, fontSize: 14,
    }}>
      <span style={{ width: 9, color: "var(--muted)", fontSize: 11 }}>{chevron ?? ""}</span>
      {icon}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </Link>
  );
}

export default async function Sidebar({ active }: { active: Active }) {
  // The tree only needs numbers/types (→ years) for the structure; the friendly
  // scheme names are only rendered for the currently-open year, so we load just
  // that year's full schemes. Keeps the always-present sidebar query light.
  const summaries = await listSchemeSummaries();
  const openYear =
    active.type && active.year ? await listSchemesByYear(active.type, active.year) : [];
  const types: FolderType[] = ["T", "C"];

  return (
    <aside style={{ width: 272, flexShrink: 0, background: "#fff", borderRight: "1px solid var(--line)", padding: "16px 12px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Row href="/" label="Home" icon={<HomeIcon />} />
        <div style={{ height: 8 }} />
        {types.map((t) => {
          const open = active.type === t;
          const ac = ACCENT[t];
          return (
            <div key={t} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Row href={`/files/${TYPE_SLUG[t]}`} label={typeLabel(t)} chevron={open ? "▾" : "▸"} bold icon={<FolderIcon accent={ac.accent} soft={ac.soft} />} />
              {open && yearsForType(summaries, t).map((y) => {
                const yopen = active.year === y;
                return (
                  <div key={y} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Row href={`/files/${TYPE_SLUG[t]}/${y}`} label={y} depth={1} chevron={yopen ? "▾" : "▸"} bold icon={<FolderIcon accent={ac.accent} soft={ac.soft} />} />
                    {yopen && schemesIn(openYear, t, y).map((s) => (
                      <Row key={s.id} href={`/schemes/${s.id}`} label={schemeName(s)} depth={2} icon={<FileIcon accent={ac.accent} />} active={active.schemeId === s.id} />
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
        <div style={{ height: 12 }} />
        <div style={{ height: 1, background: "var(--line)", margin: "0 8px" }} />
        <div style={{ height: 8 }} />
        <Row href="/skins" label="Skins" icon={<GridIcon />} />
      </div>
    </aside>
  );
}
