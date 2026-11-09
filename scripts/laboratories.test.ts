// Plan part 4.2 — the laboratories (Zadanie §8 «Лаборатория»): several per legal
// entity; the name as on the accreditation certificate, the delivery address,
// «мобилен офис», the accreditation number (information only, Реш. 108); in the
// identity store, every opening on record; never deleted.
import { readFileSync } from "node:fs";
import { readLaboratory, laboratoryDiff, LABORATORY_PROBLEM_TEXT } from "../src/lib/laboratories-model.ts";
import { openLaboratories, putLaboratory } from "../src/lib/laboratories.ts";
import { putEntity } from "../src/lib/entities.ts";
import { memOpenings } from "../src/lib/identity-store.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const input = (o: Record<string, unknown> = {}) => ({ name: "Изпитвателна лаборатория „Тест“", deliveryAddress: "Пловдив, ул. Х 2", mobileOffice: "on", accreditationNo: "123 ЛИ", ...o });
const p = (o: Record<string, unknown>) => { const r = readLaboratory(input(o)); return r.ok ? null : r.problem; };
eq("a laboratory reads: name, delivery address, mobile office, accreditation number", (() => { const r = readLaboratory(input()); return r.ok ? r.fields : r; })(), { name: "Изпитвателна лаборатория „Тест“", deliveryAddress: "Пловдив, ул. Х 2", mobileOffice: true, accreditationNo: "123 ЛИ", accreditationBody: "" });
eq("required: the name and the delivery address; the accreditation number short — and optional (Реш. 108)", [p({ name: "" }), p({ deliveryAddress: " " }), p({ accreditationNo: "x".repeat(61) }), p({ accreditationNo: "" })], ["name", "address", "accreditation", null]);
const noMark = readLaboratory(input({ mobileOffice: null }));
t("…the mark read as a checkbox posts it — none posted, none (review: asserted on its own)", noMark.ok && noMark.fields.mobileOffice === false);
t("every problem has its words", Object.values(LABORATORY_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));
eq("the journal names the fields that changed — never their values", laboratoryDiff({ name: "А", deliveryAddress: "X" }, { name: "Б", deliveryAddress: "X" }), ["name"]);

// the store, in memory
const E = "33333333-3333-4333-8333-333333333333", E2 = "44444444-4444-4444-8444-444444444444";
await putEntity(E, { name: "Ентитет ООД", country: "BG", eik: "000000019", correspondenceAddress: "София", origin: "pdf", state: "pending" }, "head@ptsbg.eu");
await putEntity(E2, { name: "Друг ООД", country: "RO", eik: "J40/1", correspondenceAddress: "Букурещ", origin: "pdf", state: "inactive" }, "head@ptsbg.eu");
const L1 = "55555555-5555-4555-8555-555555555555", L2 = "66666666-6666-4666-8666-666666666666";
await putLaboratory(L1, { ...(readLaboratory(input()) as { fields: object }).fields, entityId: E, state: "active" }, "head@ptsbg.eu");
await putLaboratory(L2, { ...(readLaboratory(input({ name: "Втора" })) as { fields: object }).fields, entityId: E, state: "active" }, "head@ptsbg.eu");
eq("several per entity, opened on record — which ones", (await openLaboratories({ actor: "head@ptsbg.eu", purpose: "names.view" }, { entityId: E })).map((l) => l.name).sort(), ["Втора", "Изпитвателна лаборатория „Тест“"]);
t("…every opening and write recorded with WHICH laboratories", memOpenings().some((o) => o.purpose === "write" && !!o.laboratoryIds?.includes(L1)) && memOpenings().some((o) => o.purpose === "names.view" && o.entityId === E && o.laboratoryIds?.length === 2));
let refused = false; try { await putLaboratory("77777777-7777-4777-8777-777777777777", { name: "Х", deliveryAddress: "Y", entityId: E2 }, "head@ptsbg.eu"); } catch { refused = true; }
t("…none added under an inactive entity", refused);
await putLaboratory(L1, { entityId: E2, name: "Преименувана" }, "head@ptsbg.eu");
eq("…a laboratory never moves to another entity; its fields change", (await openLaboratories({ actor: "a", purpose: "write" }, { laboratoryId: L1 })).map((l) => [l.entityId, l.name]), [[E, "Преименувана"]]);
eq("an id that is no id opens nothing", (await openLaboratories({ actor: "a", purpose: "write" }, { laboratoryId: "" })).length, 0);
// review: an entity made inactive takes its laboratories with it; none made active under it
await putEntity(E, { state: "inactive" }, "head@ptsbg.eu");
eq("an entity made inactive takes its laboratories with it, in the same step (review)", (await openLaboratories({ actor: "a", purpose: "write" }, { entityId: E })).map((l) => l.state), ["inactive", "inactive"]);
let reactivated = false; try { await putLaboratory(L2, { state: "active" }, "head@ptsbg.eu"); } catch (e) { reactivated = /inactive/.test(String((e as Error).message)) ? false : true; }
t("…none made active again under it — refused in words the action names (review)", !reactivated && (await openLaboratories({ actor: "a", purpose: "write" }, { laboratoryId: L2 }))[0].state === "inactive");
let noName = false; try { await putLaboratory("77777777-7777-4777-8777-777777777778", { deliveryAddress: "Y", entityId: E2 } as never, "head@ptsbg.eu"); } catch { noName = true; }
t("…memory holds the database's rules: no laboratory without its name (review)", noName);

// the migration
const sql = readFileSync(new URL("../supabase/migrations/0032_laboratories.sql", import.meta.url), "utf8");
t("0032: in the closed identity schema, under its entity — row-level security on, every API role's right revoked, a read by hand audited", /create table if not exists identity\.laboratories/.test(sql) && /entity_id uuid not null references identity\.legal_entities\(id\)/.test(sql) && /alter table identity\.laboratories enable row level security;/.test(sql) && /revoke all on identity\.laboratories from public, anon, authenticated, service_role;/.test(sql) && /grant select, insert, update, delete on identity\.laboratories to identity_auditor;/.test(sql));
t("…never deleted; held by the database itself: never moved, active only under an entity that is not inactive — read under a share lock (review)", /before delete on identity\.laboratories/.test(sql) && /before truncate on identity\.laboratories/.test(sql) && /a laboratory never moves to another entity/.test(sql) && /for share;/.test(sql) && /before insert or update of state, entity_id on identity\.laboratories/.test(sql) && !/update identity\.laboratories l set[^;]*entity_id/.test(sql));
t("…an entity made inactive takes its laboratories with it (a trigger, the same step) (review)", /after update of state on identity\.legal_entities/.test(sql) && /update identity\.laboratories set state = 'inactive'/.test(sql));
t("…what is returned is exactly what was recorded; the asked id and a write's entity recorded (review)", /where l\.id = any \(coalesce\(ids, '\{\}'\)\)/.test(sql) && /laboratory_id uuid/.test(sql) && /'write', \(select l\.entity_id from identity\.laboratories l where l\.id = p_laboratory\)/.test(sql));
t("…every opening recorded with which; only the server key may call", /insert into identity\.openings \(actor, purpose, entity_id, laboratory_id, laboratory_ids, rows\)/.test(sql) && (sql.match(/grant execute on function public\.identity_laborator[a-z_]+\([^)]*\) to service_role;/g) ?? []).length === 2 && /security definer set search_path = ''/.test(sql) && /'0032_laboratories'/.test(sql));

// the actions and the page
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const sect = actions.slice(actions.indexOf("// ── Laboratories (plan part 4.2"), actions.indexOf("// ── A legal entity's users (plan part 4.3"));
t("both laboratory actions behind labs.manage", (sect.match(/export async function \w+Action/g) ?? []).length === 2 && (sect.match(/await requireCapAnywhere\("labs\.manage"\)/g) ?? []).length === 2);
t("…the entity's state the database's to hold — not read by opening the entity; its refusal said in words (review)", !/openEntities\(/.test(sect) && (sect.match(/entityRefusal\(e, LABORATORY_PROBLEM_TEXT\.entity\)/g) ?? []).length === 2);
t("…the journal never carries a laboratory's name, address or number — in any argument (review)", !(sect.match(/logActivity\([^;]*;/g) ?? []).some((c) => /\.(name|deliveryAddress|accreditationNo)\b|\.\.\.r\.fields/.test(c)));
const page = readFileSync(new URL("../src/app/organizations/page.tsx", import.meta.url), "utf8");
t("the page opens the laboratories on record, under their entities", /openLaboratories\(\{ actor, purpose: "names\.view" \}\)/.test(page) && /<LaboratoryForms /.test(page));

console.log(`laboratories.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
