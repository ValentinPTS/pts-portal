// Plan part 5.4 — release levels, recipients, downloads (Zadanie «Три нива на пускане на
// документ», «Редакции»; Реш. 50; D15): a document to every participant, to one
// participation or to one user — each an edition; who got which edition; every download
// on record; the plan public before applying; N5 (never the live document) closed.
import { readFileSync } from "node:fs";
import { releaseFor, docsFor, readTarget, reaches, RELEASE_LEVEL_LABEL, RELEASE_PROBLEM_TEXT, type TargetRelease } from "../src/lib/release-model.ts";
import { isSendableDoc, SENDABLE_DOCS } from "../src/lib/doc-release.ts";
import { codedScheme, identityScheme, SCHEME_FIELDS } from "../src/lib/round-export.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const R = (o: Partial<TargetRelease>): TargetRelease => ({ id: "r", docKey: "instruction", level: "participation", editionId: "e2", editionNo: 2, at: "2026-11-10T10:00:00Z", by: "m", ...o });
const s = {
  sentToParticipants: { instruction: "2026-11-05T10:00:00Z", invitation: "2026-11-01T10:00:00Z" },
  releasedEditions: { instruction: { id: "e1", no: 1, at: "2026-11-05T10:00:00Z" }, invitation: { id: "i1", no: 1, at: "2026-11-01T10:00:00Z" } },
  releases: [
    R({ id: "r1", participantId: "pA" }),                                                        // ed. 2 to A, later than «all»
    R({ id: "r2", level: "user", participantId: undefined, userId: "u7", docKey: "protocol", editionId: "p1", editionNo: 1 }),
    R({ id: "r3", participantId: "pB", withdrawnAt: "2026-11-11T09:00:00Z" }),                   // withdrawn
    R({ id: "r4", participantId: "pC", docKey: "results", at: "2026-11-01T00:00:00Z", editionId: "x1", editionNo: 1 }),
  ],
};
const A = { participantIds: ["pA"] }, B = { participantIds: ["pB"] }, U = { participantIds: ["pZ"], userId: "u7" }, C = { participantIds: ["pC"] };
eq("three levels: every participant — the latest that reaches it wins; one participation gets its own later edition", [releaseFor(s, "instruction", A)?.editionNo, releaseFor(s, "instruction", B)?.editionNo, releaseFor(s, "instruction", A)?.level], [2, 1, "participation"]);
t("…a withdrawn release reaches nobody; an older «all» still does", !reaches(s.releases[2], B) && releaseFor(s, "instruction", B)?.level === "all");
t("…one user by name: only that user, whichever participation", releaseFor(s, "protocol", U)?.level === "user" && releaseFor(s, "protocol", A) === null && releaseFor(s, "protocol", { participantIds: ["pA"], userId: "u8" }) === null);
t("…only for what may ever be released: a register never, whatever is recorded", releaseFor({ ...s, sentToParticipants: { "results-coded": "x" } }, "results-coded", A) === null && releaseFor({ releases: [R({ docKey: "order", participantId: "pA" })] }, "order", A) === null);
eq("what a participation's page lists — in the fixed order, each with its edition", docsFor(s, C).map((d) => `${d.key}:${d.level}:${d.editionNo}`), ["invitation:all:1", "instruction:all:1", "results:participation:1"]);
eq("a target as posted: a participation or a user, by id — nothing else", [readTarget({ level: "participation", participantId: "6b0d2c58-1111-4222-8333-944455556666" }).ok, readTarget({ level: "user", userId: "bad id!" }).ok, readTarget({ level: "everyone" }).ok], [true, false, false]);
eq("an amendment gives every participant its edition: «all» counts from then — a release to one made before it no longer wins (review)", releaseFor({ ...s, releasedEditions: { ...s.releasedEditions, instruction: { id: "e3", no: 3, at: "2026-11-12T10:00:00Z" } } }, "instruction", A)?.editionNo, 3);
t("every level and problem has its words", Object.values(RELEASE_LEVEL_LABEL).every((v) => !!v.bg && !!v.en) && Object.values(RELEASE_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));
t("the plan is released since D15 — public for a started scheme; the Order and the statistical design never", isSendableDoc("plan") && SENDABLE_DOCS[0] === "plan" && !isSendableDoc("order") && !isSendableDoc("stat-project"));

// ── the actions ──
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const ra = actions.slice(actions.indexOf("export async function releaseDocToAction"), actions.indexOf("export async function withdrawReleaseAction"));
t("to one: who releases (docs.release) in ITS scheme; only what may be released; a target of THIS scheme's round", /await requireCap\("docs\.release", schemeId\);/.test(ra.slice(0, 500)) && /!isSendableDoc\(docKey\)/.test(ra) && /parts = \(await listParticipants\(schemeId\)\)\.filter\(\(p\) => inFinalRound\(scheme, p\)\)/.test(ra) && /if \(!u \|\| u\.state !== "active"\) return \{ error: RELEASE_REFUSAL\.user \};/.test(ra) && /if \(!entities\.includes\(u\.entityId\)\) return \{ error: RELEASE_REFUSAL\.user \};/.test(ra));
t("…as an edition, the same rules as «Изпрати»; who to tell found before anything is recorded (2.3)", /const got = await editionToSend\(scheme, docKey, note, by\);/.test(ra) && ra.indexOf("labToTell(schemeId, p.code)") < ra.indexOf("await updateSchemeWith") && /editionId: edition\.id, editionNo: edition\.no/.test(ra));
t("…on record: which edition, to which level — never a name", /Document “\$\{docKey\}” sent \$\{target\.level === "participation" \? `to one participation \(\$\{tellCode\}\)` : "to one user of a legal entity"\}/.test(ra));
t("a withdrawal: a date on the release — never removed", /withdrawnAt: at, withdrawnBy: by/.test(actions) && !/releases: \(cur\.releases \?\? \[\]\)\.filter/.test(actions));

// ── the laboratory's route ──
const route = readFileSync(new URL("../src/app/lab/doc/[scheme]/[doc]/route.ts", import.meta.url), "utf8");
t("the route: a laboratory account or a user of a legal entity — each for its own participations; a handout by the release that reaches THE participation asked for — only while it goes on in the round", /const ps = ls \? null : await getParticipantSession\(\)/.test(route) && /const viewer: ReleaseViewer = \{ participantIds: \[mine\.id\]/.test(route) && /const reaching = isSendableDoc\(doc\) && goingOn \? releaseFor\(scheme, doc, viewer\) : null;/.test(route) && /userId: ps\.user\.id/.test(route));
t("…always the edition — NEVER the live document (N5, closed for good)", !/renderCohortDoc/.test(route) && !/uploadedDocResponse/.test(route) && /This document cannot be opened right now/.test(route));
t("…every download on record: which edition, which level, the participation's code and the account — never a name (Реш. 50)", /await logAs\(\{ kind: "lab", userId: log\.actor \}, "file\.downloaded", \{ schemeId: p\.scheme, targetCode: log\.code, subject: log\.subject, summary: log\.summary \}\);/.test(route) && /subject: `edition:\$\{ed\.id\}`/.test(route));
const pub = readFileSync(new URL("../src/app/apply/[id]/plan/route.ts", import.meta.url), "utf8");
t("the plan, public before applying: a started scheme's RELEASED edition only — nothing else, never a draft (D15)", /if \(!s \|\| !isStarted\(s\) \|\| !s\.sentToParticipants\?\.plan\) return new Response\("Not found", \{ status: 404 \}\);/.test(pub) && /ed\.docKey !== "plan"/.test(pub) && !/freezeNow|render/.test(pub));
const ep = readFileSync(new URL("../src/app/schemes/[id]/editions/page.tsx", import.meta.url), "utf8");
t("«Редакции»: who got which edition, at which level, withdrawn or not; the laboratories' downloads; users' names only for who may see them — only those the releases name", /releasesOf\(e\)\.map/.test(ep) && /data-downloads=/.test(ep) && /if \(canNames && namedUsers\.length\)/.test(ep) && /openEntityUsers\(\{ actor, purpose: "names\.view" \}, \{ userId: uid \}\)/.test(ep) && /actorRole: "lab"/.test(ep) && /data-release-history=/.test(ep));
t("…the users to send to by name opened ONLY when «one user» is chosen, by who may see names (review)", /export async function releaseUsersAction[\s\S]{0,300}if \(!\(await mayNow\("names\.view", schemeId\)\)\) return \[\];/.test(actions) && /if \(v === "user" && users === null\) start\(async \(\) => \{ setUsers\(await releaseUsersAction\(schemeId\)/.test(readFileSync(new URL("../src/components/ReleaseToOne.tsx", import.meta.url), "utf8")));
t("an amendment re-issues every release of the plan or the invitation — to one participation and to one user too (review)", /const active = \(cur\.releases \?\? \[\]\)\.filter\(\(x\) => x\.docKey === doc && !x\.withdrawnAt\);/.test(actions) && /withdrawnBy: `amendment:\$\{amendmentId\}`/.test(actions) && /editionId: r\.edition\.id, editionNo: r\.edition\.no, at: now, by/.test(actions));
t("to one: a started scheme only; one user only by who may see names — on the server; an amendment meanwhile refuses it; bilingual", /if \(!isStarted\(scheme\)\) return \{ error: RELEASE_REFUSAL\.started \};/.test(ra) && /if \(target\.level === "user" && !\(await mayNow\("names\.view", schemeId\)\)\)/.test(ra) && /if \(amendedMeanwhile\) return \{ error: "Междувременно е записано изменение/.test(ra) && !/return \{ error: "Scheme not found\." \}/.test(ra));
t("stopping the share with all says what stays to one (review)", /const stillTargeted = /.test(actions) && /r\?\.stillTargeted/.test(readFileSync(new URL("../src/components/SchemeDocuments.tsx", import.meta.url), "utf8")));
// the round export: a release names a user only in identity/
const ex = { id: "x", number: "PTS 26/11-T-1", releases: [{ id: "r", docKey: "protocol", level: "user", userId: "6b0d2c58-1111-4222-8333-944455556666", editionId: "e", editionNo: 1, at: "a", by: "m" }] } as unknown as Scheme;
t("the round export: a release to one user keeps the user only in identity/ (review)", SCHEME_FIELDS.releases === "split" && !JSON.stringify(codedScheme(ex)).includes("6b0d2c58") && JSON.stringify(codedScheme(ex)).includes("protocol") && JSON.stringify(identityScheme(ex)).includes("6b0d2c58"));

console.log(`releases.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
