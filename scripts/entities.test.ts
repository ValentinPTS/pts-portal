// Plan part 4.1 — the legal entity (Zadanie §8; А13; Н1): name, ЕИК (a Bulgarian one by
// its check digit), country, VAT (VIES or a document), address for correspondence,
// МОЛ, language, state; checked — FOR its numbers as they are — before it is active;
// never deleted; in the identity store, every opening on record.
import { readFileSync } from "node:fs";
import { readEntity, entityChecked, stateProblem, entityDiff, eikKey, normVat, ENTITY_PROBLEM_TEXT, type LegalEntity } from "../src/lib/entities-model.ts";
import { validateEik } from "../src/lib/verify-eik.ts";
import { openEntities, putEntity, entityKeyTaken } from "../src/lib/entities.ts";
import { memOpenings } from "../src/lib/identity-store.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const eik9 = (stem: string) => [..."0123456789"].map((d) => stem + d).find((x) => validateEik(x).ok)!;
const EIK = eik9("12345678"), EIK2 = eik9("87654321");
const input = (o: Record<string, unknown> = {}) => ({ name: "Лаборатория ООД", country: "BG", eik: EIK, vat: `BG${EIK}`, correspondenceAddress: "София, ул. Х 1", mol: "Иван Иванов", language: "bg", ...o });
const p = (o: Record<string, unknown>, others: { id: string; country: string; eik: string }[] = []) => { const r = readEntity(input(o), others); return r.ok ? null : r.problem; };

eq("a whole entity reads", (() => { const r = readEntity(input(), []); return r.ok ? r.fields : r; })(), { name: "Лаборатория ООД", country: "BG", eik: EIK, vat: `BG${EIK}`, correspondenceAddress: "София, ул. Х 1", officialEmail: "", mol: "Иван Иванов", language: "bg" });
eq("a Bulgarian ЕИК by its check digit; elsewhere the registration number as it is", [p({ eik: EIK.slice(0, 8) + ((Number(EIK[8]) + 1) % 10) }), p({ country: "RO", eik: "J40/1234/2020", vat: "RO1234567" })], ["eik-bg", null]);
eq("required: the name, the ЕИК, the address", [p({ name: " " }), p({ eik: "" }), p({ correspondenceAddress: "" })], ["name", "eik", "address"]);
eq("a VAT number that does not read; a country that is no code; a language", [p({ vat: "12" }), p({ country: "Bulgaria" }), p({ language: "de" })], ["vat", "country", "language"]);
// review: normal forms
eq("one company however its number is typed: «HRB 12345» = «hrb-12345» (review)", [eikKey("HRB 12345"), eikKey("hrb-12345"), p({ country: "DE", eik: "hrb-12345", vat: "" }, [{ id: "x", country: "DE", eik: "HRB 12345" }])], ["HRB12345", "HRB12345", "duplicate"]);
eq("the VAT number's normal form, stored and sent alike: punctuation gone, the prefix, Greece as EL, never cut (review)", [normVat("bg 123.456.789", "BG"), normVat("123456789", "GR"), normVat("123456789", "BG"), normVat("X".repeat(20), "BG"), normVat("", "BG")], ["BG123456789", "EL123456789", "BG123456789", null, ""]);
eq("the same ЕИК in the same country twice: refused — the same company", [p({}, [{ id: "x", country: "BG", eik: EIK }]), p({}, [{ id: "x", country: "BG", eik: EIK2 }])], ["duplicate", null]);
t("…but the entity itself, corrected, is not its own duplicate", readEntity(input(), [{ id: "self", country: "BG", eik: EIK }], "self").ok);
t("every problem has its words", Object.values(ENTITY_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));

// the checks — FOR the numbers they checked (review)
const base = { eik: EIK, vat: `BG${EIK}`, country: "BG" } as Pick<LegalEntity, "eik" | "vat" | "country">;
const viesOk = { status: "valid" as const, checkedAt: "x", vat: `BG${EIK}`, country: "BG" };
const tick = { by: "a", at: "b", eik: EIK, vat: `BG${EIK}`, country: "BG" };
eq("checked: VIES valid for THIS number, or a document; PTS's tick for these numbers", [entityChecked({ ...base, vies: viesOk }), entityChecked({ ...base, vies: viesOk, manualCheck: tick }), entityChecked({ ...base, proofPath: "p", manualCheck: { ...tick, proofPath: "p" } })], [{ registry: true, manual: false }, { registry: true, manual: true }, { registry: true, manual: true }]);
eq("…VIES's answer for another number counts for nothing; nor the tick made for it (review)", [entityChecked({ ...base, vat: "BG999999999", vies: viesOk, manualCheck: tick }), entityChecked({ ...base, eik: EIK2, vies: viesOk, manualCheck: tick }).manual], [{ registry: false, manual: false }, false]);
eq("…a tick made for a document now replaced counts for nothing (review)", entityChecked({ ...base, proofPath: "new", manualCheck: { ...tick, proofPath: "old" } }).manual, false);
eq("active only with the registry AND PTS's tick; inactive any time", [stateProblem({ ...base, state: "pending" } as never, "active"), stateProblem({ ...base, state: "pending", vies: viesOk, manualCheck: tick } as never, "active"), stateProblem({ ...base, state: "pending", vies: { ...viesOk, status: "invalid" }, manualCheck: tick } as never, "active"), stateProblem({ ...base, state: "active" } as never, "inactive"), stateProblem({ ...base, state: "active" } as never, "active")], ["unchecked", null, "unchecked", null, "same"]);
eq("the journal names the typed fields that changed — never their values, never a «state» that did not (review)", [entityDiff({ name: "А", vat: "BG1", state: "active" }, { name: "Б", vat: "BG1" }), entityDiff({ name: "А" }, { name: "А" })], [["name"], []]);

// the store, in memory: every opening on record, which entities
const id = "11111111-1111-4111-8111-111111111111";
await putEntity(id, { ...(readEntity(input({ eik: EIK2, vat: "" }), []) as { fields: object }).fields, origin: "pdf", state: "pending" }, "head@ptsbg.eu");
const got = await openEntities({ actor: "head@ptsbg.eu", purpose: "names.view" });
t("written and opened through the identity store", got.some((e) => e.id === id && e.eik === EIK2 && e.state === "pending"));
t("…every write and opening on record — who, why and WHICH entities (review)", memOpenings().some((o) => o.purpose === "write" && o.entityId === id && !!o.entityIds?.includes(id)) && memOpenings().some((o) => o.purpose === "names.view" && !!o.entityIds?.includes(id)));
eq("an id that is no id opens nothing — never every entity (review)", [(await openEntities({ actor: "a", purpose: "write" }, "")).length, (await openEntities({ actor: "a", purpose: "write" }, "not-a-uuid")).length], [0, 0]);
let threw = false; try { await openEntities({ actor: " ", purpose: "names.view" }); } catch { threw = true; }
t("…never opened without who", threw);
eq("the duplicate question asked narrowly, by the normal form — recorded with the one matched (review)", [await entityKeyTaken("a@b", "BG", ` ${EIK2} `), await entityKeyTaken("a@b", "BG", EIK2, id), await entityKeyTaken("a@b", "BG", EIK)], [true, false, false]);
let dup = false; try { await putEntity("22222222-2222-4222-8222-222222222222", { name: "Друго", country: "BG", eik: EIK2, correspondenceAddress: "x" }, "head@ptsbg.eu"); } catch { dup = true; }
t("…the same ЕИК twice refused by the store too", dup);
let notActive = false; try { await putEntity(id, { state: "active" }, "head@ptsbg.eu"); } catch { notActive = true; }
t("…active without PTS's tick refused by the store, as by the database (review)", notActive);
await putEntity(id, { origin: "portal" }, "head@ptsbg.eu");
eq("…its origin never changed after (review)", (await openEntities({ actor: "a", purpose: "write" }, id))[0].origin, "pdf");

// the migration
const sql = readFileSync(new URL("../supabase/migrations/0031_legal_entities.sql", import.meta.url), "utf8");
t("0031: in the closed identity schema — row-level security on, every API role's right revoked", /create table if not exists identity\.legal_entities/.test(sql) && /alter table identity\.legal_entities enable row level security;/.test(sql) && /revoke all on identity\.legal_entities from public, anon, authenticated, service_role;/.test(sql));
t("…a read by hand in the SQL editor audited, as the participants' (review)", /grant select, insert, update, delete on identity\.legal_entities to identity_auditor;/.test(sql));
t("…never deleted (row and truncate)", /before delete on identity\.legal_entities/.test(sql) && /before truncate on identity\.legal_entities/.test(sql));
t("…one company once, by the normal form; a Bulgarian ЕИК 9 or 13 digits; active only with PTS's check (review)", /create unique index if not exists legal_entities_eik_key on identity\.legal_entities \(country, eik_key\)/.test(sql) && sql.includes("check (country <> 'BG' or eik ~ '^([0-9]{9}|[0-9]{13})$')") && sql.includes("check (state <> 'active' or manual_check is not null)"));
t("…every document kept in its history", sql.includes("proof_history jsonb not null default '[]'::jsonb"));
t("…what is returned is exactly what was recorded (4.2 review)", sql.includes("where e.id = any (coalesce(ids, '{}'))"));
t("…the only ways in record every opening, WHICH entities; only the server key may call them", /insert into identity\.openings \(actor, purpose, entity_id, entity_ids, rows\)/.test(sql) && (sql.match(/grant execute on function public\.identity_entit[a-z_]+\([^)]*\) to service_role;/g) ?? []).length === 3 && (sql.match(/revoke execute on function public\.identity_entit[a-z_]+\([^)]*\) from public, anon, authenticated;/g) ?? []).length === 3 && /security definer set search_path = ''/.test(sql));
t("…recorded as applied", /insert into public\.app_migrations \(name\) values \('0031_legal_entities'\)/.test(sql));

// the actions, the route and the page
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const sect = actions.slice(actions.indexOf("// ── Legal entities (plan part 4.1"), actions.indexOf("// ── Laboratories (plan part 4.2"));
const proofs = readFileSync(new URL("../src/lib/entity-proofs.ts", import.meta.url), "utf8");
t("every entity action behind labs.manage (the document's too)", (sect.match(/export async function \w+Action/g) ?? []).length === 5 && (sect.match(/await requireCapAnywhere\("labs\.manage"\)/g) ?? []).length === 5);
t("a changed number checked again from the start — VIES, the tick AND the document set aside (review)", /const recheck = !!was && \(eikKey\(was\.eik\) !== eikKey\(eff\.eik\) \|\| was\.vat !== eff\.vat \|\| was\.country !== eff\.country\)/.test(sect) && /vies: undefined, manualCheck: undefined, proofPath: undefined/.test(sect));
t("VIES's answer kept only for the number asked — a change meanwhile refused (review)", /if \(!fresh \|\| fresh\.vat !== e\.vat \|\| fresh\.country !== e\.country\)/.test(sect) && /vat: e\.vat, country: e\.country/.test(sect));
t("an active entity whose checks no longer hold goes back to pending — on record, before and after (review)", /before: \{ state: "active" \}, after: \{ state: "pending" \}/.test(sect));
t("a new document: into the history, PTS's tick to make again; a file whose record failed removed (review)", /proofHistory: history, \.\.\.\(e\.manualCheck \? \{ manualCheck: undefined \} : \{\}\)/.test(sect) && /await removeProof\(path\);/.test(sect));
t("the journal never carries an entity's name", !/summary: `[^`]*\$\{(e|was|fresh|r\.fields)\.name/.test(sect) && !/after: \{[^}]*\bname\b/.test(sect));
const route = readFileSync(new URL("../src/app/organizations/proof/[id]/route.ts", import.meta.url), "utf8");
t("the document: a real PDF, PNG or JPG, 4 MB at most, in a private bucket under a random name; opened — the current or one from its history — only through a gated, journalled route", /if \(!magicMatches\(bytes, file\.type\)\)/.test(sect) && /MAX_PROOF_BYTES = 4_000_000/.test(proofs) && /const path = `\$\{randomUUID\(\)\}\.\$\{ext\}`/.test(proofs) && /await requireCapAnywhere\("labs\.manage"\)/.test(route) && /status: 503/.test(route) && /history\[Number\(n\) - 1\]\.path/.test(route));
const page = readFileSync(new URL("../src/app/organizations/page.tsx", import.meta.url), "utf8");
t("the page opens the entities on record, for showing names", /openEntities\(\{ actor, purpose: "names\.view" \}\)/.test(page) && /requireSection\("organizations"\)/.test(page));

console.log(`entities.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
