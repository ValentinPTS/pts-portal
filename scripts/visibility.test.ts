// Реш. 147 (plan part 0.3): nothing that has not started is visible to a lab. A lab
// that PTS has already entered into a scheme still being prepared must not see that
// participation until the scheme starts; every lab-side reader goes through
// listVisibleParticipations. Runs on the in-memory store (no database).
import { isStarted, listVisibleParticipations } from "../src/lib/visibility.ts";
import { addScheme, updateScheme } from "../src/lib/store.ts";
import { addParticipant } from "../src/lib/participants.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import type { Scheme, SchemeStatus } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const all: SchemeStatus[] = ["draft", "open", "running", "report", "closed"];
for (const st of all) t(`isStarted(${st})`, isStarted({ status: st }) === (st !== "draft"));

const mk = (id: string, number: string, status: SchemeStatus): Scheme => ({ ...structuredClone(pavingBlocks), id, number, status });
await addScheme(mk("VIS-D", "PTS 27/01-T-9", "draft"));
await addScheme(mk("VIS-O", "PTS 27/02-T-9", "running"));
await addParticipant({ schemeId: "VIS-D", labName: "Lab X", labId: "LAB-VIS" }, "test");
await addParticipant({ schemeId: "VIS-O", labName: "Lab X", labId: "LAB-VIS" }, "test");

let seen = await listVisibleParticipations("LAB-VIS");
t("draft participation hidden", !seen.some((p) => p.schemeId === "VIS-D"), JSON.stringify(seen.map((p) => p.schemeId)));
t("started participation shown", seen.some((p) => p.schemeId === "VIS-O"));

await updateScheme("VIS-D", { status: "open" });
seen = await listVisibleParticipations("LAB-VIS");
t("visible once the scheme starts", seen.some((p) => p.schemeId === "VIS-D"));
t("unknown lab sees nothing", (await listVisibleParticipations("NOBODY")).length === 0);

console.log(`visibility.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
