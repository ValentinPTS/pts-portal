// The names a function returns (RETURNS TABLE) may not be keywords Postgres keeps for
// columns or reserves — «position» there stopped migration 0033 from applying (4.3
// review). Every migration, every list: no Postgres here to try them, so the grammar's
// own lists (PostgreSQL 17, src/include/parser/kwlist.h: COL_NAME_KEYWORD and
// RESERVED_KEYWORD) are checked instead. Unquoted names only — a quoted one may be any.
import { readFileSync, readdirSync } from "node:fs";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const COL_NAME = "between bigint bit boolean char character coalesce dec decimal exists extract float greatest grouping inout int integer interval json json_array json_arrayagg json_exists json_object json_objectagg json_query json_scalar json_serialize json_table json_value least merge_action national nchar none normalize nullif numeric out overlay position precision real row setof smallint substring time timestamp treat trim values varchar xmlattributes xmlconcat xmlelement xmlexists xmlforest xmlnamespaces xmlparse xmlpi xmlroot xmlserialize xmltable".split(" ");
const RESERVED = "all analyse analyze and any array as asc asymmetric both case cast check collate column constraint create current_catalog current_date current_role current_time current_timestamp current_user default deferrable desc distinct do else end except false fetch for foreign from grant group having in initially intersect into lateral leading limit localtime localtimestamp not null offset on only or order placing primary references returning select session_user some symmetric system_user table then to trailing true union unique user using variadic when where window with".split(" ");
const BAD = new Set([...COL_NAME, ...RESERVED]);

/** The unquoted names of every RETURNS TABLE (…) list in a migration. */
export function returnsTableNames(sql: string): string[] {
  const out: string[] = [];
  const re = /returns\s+table\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    let depth = 1, i = m.index + m[0].length, start = i;
    const parts: string[] = [];
    for (; i < sql.length && depth > 0; i++) {
      const c = sql[i];
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0) parts.push(sql.slice(start, i)); }
      else if (c === "," && depth === 1) { parts.push(sql.slice(start, i)); start = i + 1; }
    }
    for (const p of parts) {
      const name = p.replace(/--[^\n]*/g, "").trim().split(/\s+/)[0] ?? "";
      if (name && !name.startsWith('"')) out.push(name.toLowerCase());
    }
  }
  return out;
}

t("the check reads a list", JSON.stringify(returnsTableNames("returns table (id uuid, position text, \"order\" int, n numeric(10, 2))")) === JSON.stringify(["id", "position", "n"]));
t("…and knows the keyword that stopped 0033", BAD.has("position") && !BAD.has("name") && !BAD.has("language") && !BAD.has("role"));

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
t("there are migrations to check", files.length > 30);
for (const f of files) {
  const names = returnsTableNames(readFileSync(new URL(f, dir), "utf8"));
  const bad = names.filter((n) => BAD.has(n));
  t(`${f}: no keyword names a returned column`, bad.length === 0, bad.join(", "));
}

console.log(`sql-keywords.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
