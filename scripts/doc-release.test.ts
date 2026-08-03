// Releasing documents to participants. This is the boundary between what the
// provider keeps and what a laboratory can fetch, so the assertions here are the
// ones that must never quietly change.
import { SENDABLE_DOCS, isSendableDoc, canLabFetchDoc, releasedDocs, LAB_DOC_SLOTS, isLabDocSlot } from "../src/lib/doc-release.ts";
import { ALL_DOC_KEYS } from "../src/lib/doc-stages.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };

const NOTHING = { reported: false, hasCert: false };

// ── the allow-list ───────────────────────────────────────────────────────────
ok("every sendable key is a real document", SENDABLE_DOCS.every((k) => ALL_DOC_KEYS.includes(k)));

// §4.2 and the owner's own words: these never reach a laboratory, whatever is clicked.
for (const key of ["order", "plan", "stat-project", "registered", "registered-coded", "results-coded", "application"]) {
  ok(`${key} can never be released`, !isSendableDoc(key));
  ok(`${key} is unfetchable even if a stray timestamp exists`,
    !canLabFetchDoc(key, { ...NOTHING, sent: { [key]: "2026-07-31T09:00:00Z" } }));
}

// report and certificate are ISSUED, not sent — a different act with its own gate
ok("report is not in the send list", !isSendableDoc("report"));
ok("certificate is not in the send list", !isSendableDoc("certificate"));

// ── the gate ─────────────────────────────────────────────────────────────────
ok("an unreleased handout is not fetchable", !canLabFetchDoc("instruction", NOTHING));
ok("uploading is not releasing", !canLabFetchDoc("instruction", { ...NOTHING, sent: {} }));
ok("a released handout is fetchable", canLabFetchDoc("instruction", { ...NOTHING, sent: { instruction: "2026-07-31T09:00:00Z" } }));
ok("releasing one document does not release another",
  !canLabFetchDoc("results", { ...NOTHING, sent: { instruction: "2026-07-31T09:00:00Z" } }));

ok("the report waits for the round to be reported", !canLabFetchDoc("report", NOTHING));
ok("the report opens when reported", canLabFetchDoc("report", { reported: true, hasCert: false }));
ok("the certificate waits until issued for THIS code", !canLabFetchDoc("certificate", NOTHING));
ok("the certificate opens once issued", canLabFetchDoc("certificate", { reported: false, hasCert: true }));
ok("reporting the round does not open the certificate", !canLabFetchDoc("certificate", { reported: true, hasCert: false }));

ok("an unknown key is never fetchable", !canLabFetchDoc("no-such-doc", { ...NOTHING, sent: { "no-such-doc": "x" } }));

// ── the lab's list ───────────────────────────────────────────────────────────
ok("nothing released → empty list", releasedDocs(undefined).length === 0 && releasedDocs({}).length === 0);
{
  // insertion order must NOT decide the list order — the fixed order does, so the
  // lab always sees the documents in the same sequence.
  const list = releasedDocs({ results: "2026-07-03T09:00:00Z", invitation: "2026-07-01T09:00:00Z" });
  ok("released list follows the fixed order", JSON.stringify(list.map((r) => r.key)) === JSON.stringify(["invitation", "results"]));
  ok("released list keeps when each went out", list[0].at === "2026-07-01T09:00:00Z");
}
{
  // a key that is not sendable must not appear even if it is somehow in the map
  const list = releasedDocs({ "stat-project": "2026-07-01T09:00:00Z", protocol: "2026-07-02T09:00:00Z" });
  ok("the list drops anything not sendable", JSON.stringify(list.map((r) => r.key)) === JSON.stringify(["protocol"]));
}

// ── per-laboratory slots ─────────────────────────────────────────────────────
// isLabDocSlot decides whether a string off the wire may address a storage slot,
// so the inherited-property hole matters: with `in`, "toString" would pass.
ok("proforma is a slot", isLabDocSlot("proforma"));
for (const junk of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__", "", "../secret", "results"]) {
  ok(`"${junk}" is not a slot`, !isLabDocSlot(junk));
}
ok("every slot is labelled in both languages",
  Object.values(LAB_DOC_SLOTS).every((s) => s.bg.trim().length > 0 && s.en.trim().length > 0));
// The two families must stay disjoint: a per-lab slot must never be reachable
// through the cohort gate, which does not know about codes at all.
ok("no per-lab slot is also a cohort document",
  Object.keys(LAB_DOC_SLOTS).every((k) => !isSendableDoc(k)));
ok("a per-lab slot is not fetchable through the cohort gate",
  Object.keys(LAB_DOC_SLOTS).every((k) => !canLabFetchDoc(k, { ...NOTHING, sent: { [k]: "2026-07-31T09:00:00Z" } })));

console.log(`doc-release.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
