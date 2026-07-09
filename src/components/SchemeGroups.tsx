import { SchemeTile } from "@/components/Tiles";
import { LIFECYCLE_ORDER, lifecycleMeta, lifecycleOf } from "@/lib/folders";
import { DEFAULT_LANG, type UiLang } from "@/lib/i18n";
import type { Scheme } from "@/lib/types";

const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 18 };

// Scheme tiles grouped by lifecycle (Current → Coming → Finished), replacing the
// old flat grid in the explorer. Groups with no schemes are hidden; finished
// schemes are dimmed so active work stands out. `extraTile` (the "new scheme"
// dialog tile) renders in its own row below the groups, never dimmed.
export default function SchemeGroups({ schemes, lang = DEFAULT_LANG, extraTile }: {
  schemes: Scheme[];
  lang?: UiLang;
  extraTile?: React.ReactNode;
}) {
  const groups = LIFECYCLE_ORDER
    .map((lc) => ({ lc, list: schemes.filter((s) => lifecycleOf(s.status) === lc) }))
    .filter((g) => g.list.length > 0);

  if (groups.length === 0) {
    return extraTile ? <div style={gridStyle}>{extraTile}</div> : null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {groups.map(({ lc, list }) => {
        const meta = lifecycleMeta(lc, lang);
        return (
          <section key={lc}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 10px" }}>
              <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: meta.color }}>
                {meta.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, color: meta.color, background: "var(--green-soft)", border: "1px solid var(--line)" }}>
                {list.length}
              </span>
              <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>
            <div style={{ ...gridStyle, opacity: lc === "finished" ? 0.82 : 1 }}>
              {list.map((s) => <SchemeTile key={s.id} s={s} lang={lang} />)}
            </div>
          </section>
        );
      })}
      {extraTile ? <div style={{ ...gridStyle, marginTop: 14 }}>{extraTile}</div> : null}
    </div>
  );
}
