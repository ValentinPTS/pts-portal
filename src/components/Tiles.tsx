import Link from "next/link";
import { FolderIcon, FileIcon } from "@/components/FileIcons";
import { ACCENT, statusChip, schemeName, type FolderType } from "@/lib/folders";
import { t, DEFAULT_LANG, type UiLang } from "@/lib/i18n";
import type { Scheme } from "@/lib/types";

const stripStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "#f8faf8", borderTop: "1px solid var(--line)" };

// A big folder tile (year folders, and the home Testing/Calibration folders).
export function FolderTile({ href, label, sub, type }: { href: string; label: string; sub: string; type: FolderType }) {
  const ac = ACCENT[type];
  return (
    <Link href={href} className="card no-underline" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12, minHeight: 150, justifyContent: "space-between", borderLeft: `4px solid ${ac.accent}` }}>
      <FolderIcon size={48} accent={ac.accent} soft={ac.soft} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>{label}</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{sub}</div>
      </div>
    </Link>
  );
}

// A scheme folder tile (hybrid: big icon + status chip + details strip).
export function SchemeTile({ s, lang = DEFAULT_LANG }: { s: Scheme; lang?: UiLang }) {
  const ac = ACCENT[s.type];
  const st = statusChip(s.status, lang);
  const built = Object.values(s.docs ?? {}).filter((d) => d?.bg || d?.en).length;
  const date = s.orderDate || s.revisionDate || "";
  return (
    <Link href={`/schemes/${s.id}`} className="card no-underline" style={{ overflow: "hidden", display: "flex", flexDirection: "column", padding: 0 }}>
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <FolderIcon size={48} accent={ac.accent} soft={ac.soft} />
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: st.fg, background: st.bg }}>{st.label}</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, color: "var(--ink)" }}>{schemeName(s)}</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{s.number}</div>
      </div>
      <div style={stripStyle}>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{built}/14 {t(lang, "tile.builtSuffix")}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>{date}</span>
      </div>
    </Link>
  );
}

// A document file tile (inside a scheme).
export function DocTile({ href, name, form, built, action = "Open ↗", builtLabel = "Built ✓", emptyLabel = "Not started" }: { href: string; name: string; form: string; built: boolean; action?: string; builtLabel?: string; emptyLabel?: string }) {
  return (
    <Link href={href} className="card no-underline" style={{ overflow: "hidden", display: "flex", flexDirection: "column", padding: 0 }}>
      <div style={{ padding: 15, display: "flex", flexDirection: "column", gap: 9 }}>
        <FileIcon size={36} accent="#2b6744" />
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)", lineHeight: 1.2 }}>{name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{form}</div>
      </div>
      <div style={{ ...stripStyle, padding: "9px 15px" }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, color: built ? "#2b6744" : "#5b6b62", background: built ? "#e8f1ea" : "#eef1ee" }}>{built ? builtLabel : emptyLabel}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "var(--green-dark)" }}>{action}</span>
      </div>
    </Link>
  );
}
