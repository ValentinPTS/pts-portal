import { addLab, getLabByEmail, getLab, listLabs } from "../src/lib/labs.ts";
import { addParticipant, listParticipationsForLab } from "../src/lib/participants.ts";
import { listSchemes, getSchemesByIds } from "../src/lib/store.ts";

// Lab-portal data layer (in-memory; no Supabase env in a bare node script, so the
// real DB is never touched). Verifies identity lookup + per-lab scoping.

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };

const all = await listSchemes();
const ids = all.map((s) => s.id);

const lab = await addLab({ email: "Lab@Acme.BG", name: "Acme Testing Ltd." });
ok("email stored lower-cased", lab.email === "lab@acme.bg");
ok("getLabByEmail is case-insensitive", (await getLabByEmail("  LAB@acme.bg "))?.id === lab.id);
ok("getLab by id", (await getLab(lab.id))?.name === "Acme Testing Ltd.");

const other = await addLab({ email: "other@lab.bg", name: "Other Lab" });
ok("listLabs has both", (await listLabs()).length >= 2);

await addParticipant({ schemeId: ids[0], labName: "Acme Testing Ltd.", labId: lab.id });
await addParticipant({ schemeId: ids[1] ?? ids[0], labName: "Acme Testing Ltd.", labId: lab.id });
await addParticipant({ schemeId: ids[0], labName: "Other Lab", labId: other.id });

const mine = await listParticipationsForLab(lab.id);
ok("lab sees its own participations (2)", mine.length === 2);
ok("scoping — only this lab's rows", mine.every((p) => p.labId === lab.id));
ok("each participation has a code", mine.every((p) => !!p.code && p.code.length >= 3));
ok("other lab is isolated (1)", (await listParticipationsForLab(other.id)).length === 1);
ok("unknown lab → none", (await listParticipationsForLab("nope")).length === 0);

const schemes = await getSchemesByIds([ids[0], ids[0], "does-not-exist", ids[1] ?? ids[0]].filter(Boolean));
ok("getSchemesByIds dedupes + drops unknown", schemes.length === new Set([ids[0], ids[1] ?? ids[0]]).size);

console.log(`\nlab-portal.test: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
