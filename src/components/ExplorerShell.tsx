import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import type { FolderType } from "@/lib/folders";

type Crumb = { label: string; href?: string };

// Shared chrome for the folder-explorer pages: a breadcrumb bar + the sidebar tree
// + the page's main content. Sits inside the (full-width) app main.
export default function ExplorerShell({
  breadcrumb,
  active,
  children,
}: {
  breadcrumb: Crumb[];
  active: { type?: FolderType; folderId?: string; schemeId?: string };
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 24px", background: "#fff", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
        {breadcrumb.map((c, i) => {
          const last = i === breadcrumb.length - 1;
          const node = (
            <span style={{ fontSize: 16, fontWeight: last ? 700 : 500, color: last ? "var(--ink)" : "var(--muted)" }}>{c.label}</span>
          );
          return (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {c.href && !last ? <Link href={c.href} className="no-underline">{node}</Link> : node}
              {!last && <span style={{ color: "var(--muted)", fontSize: 16 }}>›</span>}
            </span>
          );
        })}
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "stretch", background: "var(--bg)" }}>
        <Sidebar active={active} />
        <main style={{ flex: 1, minWidth: 0, padding: "24px 28px" }}>{children}</main>
      </div>
    </div>
  );
}
