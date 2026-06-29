import Link from "next/link";
import { listSchemesInFolder } from "@/lib/store";
import { listFolders, ancestry } from "@/lib/folder-tree";
import { FolderIcon, FileIcon, HomeIcon, GridIcon } from "@/components/FileIcons";
import { TYPE_SLUG, typeLabel, schemeName, ACCENT, type FolderType } from "@/lib/folders";
import { getServerT } from "@/lib/i18n-server";
import type { Folder } from "@/lib/types";

type Active = { type?: FolderType; folderId?: string; schemeId?: string };

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
  const types: FolderType[] = ["T", "C"];
  const { lang, tr } = await getServerT();

  // Only the open type's folder tree is loaded; within it, only folders on the open
  // PATH are expanded, and schemes are shown only for the currently-open folder.
  const openType = active.type;
  const folders: Folder[] = openType ? await listFolders(openType) : [];
  const openIds = new Set<string>();
  if (openType && active.folderId) {
    (await ancestry(openType, active.folderId)).forEach((f) => openIds.add(f.id));
  }
  // schemes shown under the currently-open folder (root = folderId undefined while a
  // type is open but no folder selected)
  const openFolderSchemes = openType
    ? await listSchemesInFolder(openType, active.folderId ?? null)
    : [];

  function renderFolders(type: FolderType, parentId: string | null, depth: number): React.ReactNode {
    const ac = ACCENT[type];
    const children = folders.filter((f) => (f.parentId ?? null) === (parentId ?? null));
    return children.map((f) => {
      const isOpen = openIds.has(f.id) || active.folderId === f.id;
      const isActive = active.folderId === f.id && !active.schemeId;
      return (
        <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Row href={`/files/${TYPE_SLUG[type]}/f/${f.id}`} label={f.name} depth={depth} chevron={isOpen ? "▾" : "▸"} bold
            icon={<FolderIcon accent={ac.accent} soft={ac.soft} />} active={isActive} />
          {isOpen && (
            <>
              {renderFolders(type, f.id, depth + 1)}
              {active.folderId === f.id && openFolderSchemes.map((s) => (
                <Row key={s.id} href={`/schemes/${s.id}`} label={schemeName(s)} depth={depth + 1}
                  icon={<FileIcon accent={ac.accent} />} active={active.schemeId === s.id} />
              ))}
            </>
          )}
        </div>
      );
    });
  }

  return (
    <aside style={{ width: 272, flexShrink: 0, background: "#fff", borderRight: "1px solid var(--line)", padding: "16px 12px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Row href="/" label={tr("common.home")} icon={<HomeIcon />} />
        <div style={{ height: 8 }} />
        {types.map((t) => {
          const open = active.type === t;
          const ac = ACCENT[t];
          return (
            <div key={t} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Row href={`/files/${TYPE_SLUG[t]}`} label={typeLabel(t, lang)} chevron={open ? "▾" : "▸"} bold
                icon={<FolderIcon accent={ac.accent} soft={ac.soft} />} active={open && !active.folderId && !active.schemeId} />
              {open && (
                <>
                  {renderFolders(t, null, 1)}
                  {/* schemes directly under the type root */}
                  {!active.folderId && openFolderSchemes.map((s) => (
                    <Row key={s.id} href={`/schemes/${s.id}`} label={schemeName(s)} depth={1}
                      icon={<FileIcon accent={ac.accent} />} active={active.schemeId === s.id} />
                  ))}
                </>
              )}
            </div>
          );
        })}
        <div style={{ height: 12 }} />
        <div style={{ height: 1, background: "var(--line)", margin: "0 8px" }} />
        <div style={{ height: 8 }} />
        <Row href="/skins" label={tr("nav.skins")} icon={<GridIcon />} />
      </div>
    </aside>
  );
}
