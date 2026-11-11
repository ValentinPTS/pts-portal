// Plan part 10.3 — anonymous feedback (Реш. 92, 122; К21): the sheet's five questions, each optional, one at
// least; counters and words only — no time, no participation, no account, no journal line; once per
// participation; shown to PTS from three (or the scheme closed); kept apart from complaints.
import { readFileSync } from "node:fs";
import { readFeedback, keysOf, wordsOf, feedbackOffered, feedbackShown, feedbackBand, sortedWords, WORDS_MAX } from "../src/lib/feedback-model.ts";
import { giveFeedback, feedbackGiven, feedbackOf } from "../src/lib/feedback.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

// ── the answers ──
const full = readFeedback({ q1: "5", q2: "3", q3: "other", q3text: "  зависи \r\n от цената ", q4: "плочки", q5: "" });
t("the answers read: ratings, «other» with its words, the suggestions; a blank one left out", full.ok && JSON.stringify(full.answers) === JSON.stringify({ q1: 5, q2: 3, q3: "other", q3text: "зависи \n от цената", q4: "плочки" }));
t("one answer at least; a rating 1–5 only; yes / no / other only", !readFeedback({}).ok && (readFeedback({}) as { problem: string }).problem === "empty" && (readFeedback({ q1: "6" }) as { problem: string }).problem === "rating" && (readFeedback({ q2: "0" }) as { problem: string }).problem === "rating" && (readFeedback({ q3: "maybe" }) as { problem: string }).problem === "again");
t("«other»'s words only with «other»; the words' limit", JSON.stringify((readFeedback({ q3: "yes", q3text: "x" }) as { answers: object }).answers) === JSON.stringify({ q3: "yes" }) && (readFeedback({ q5: "я".repeat(WORDS_MAX + 1) }) as { problem: string }).problem === "too-long" && readFeedback({ q5: "я".repeat(WORDS_MAX) }).ok);
t("the counters one feedback adds: «total» and each answer — never a time or a code", full.ok && keysOf(full.answers).join() === "total,q1:5,q2:3,q3:other" && keysOf({ q4: "x" }).join() === "total");
t("the words by question only", full.ok && JSON.stringify(wordsOf(full.answers)) === JSON.stringify([{ q: "q3", text: "зависи \n от цената" }, { q: "q4", text: "плочки" }]));
const REPORT = { status: "report" }, CLOSED = { status: "closed", lifecycle: { acts: [{ act: "close" }] } }, BACK = { status: "report", lifecycle: { acts: [{ act: "close" }, { act: "back" }] } };
t("offered while the report stands, to a participation on the final list — never once the records were closed, even after a step back (10.3 review)", feedbackOffered(REPORT, true) && !feedbackOffered(REPORT, false) && !feedbackOffered({ status: "processing" }, true) && !feedbackOffered(CLOSED, true) && !feedbackOffered(BACK, true));
t("shown to PTS only once the records are closed, and from three — while given, only «fewer than three / three or more»", !feedbackShown(5, REPORT) && !feedbackShown(2, CLOSED) && feedbackShown(3, CLOSED) && !feedbackShown(3, BACK) && feedbackBand(0) === "none" && feedbackBand(2) === "under" && feedbackBand(7) === "enough");
t("10.3 review: control, bidi and zero-width characters out; line breaks kept", JSON.stringify((readFeedback({ q5: "a\u202Eb\u200Bc\u0085d\ne" }) as { answers: { q5: string } }).answers.q5) === JSON.stringify("abcd\ne"));
t("the words in a fixed order — never the order they came in", JSON.stringify(sortedWords([{ q: "q5", text: "б" }, { q: "q4", text: "в" }, { q: "q5", text: "а" }])) === JSON.stringify([{ q: "q4", text: "в" }, { q: "q5", text: "а" }, { q: "q5", text: "б" }]));

// ── the store (memory) ──
t("given once — a second for the participation changes nothing", (await giveFeedback("S1", "p1", ["total", "q1:5"], [{ q: "q5", text: "добре" }])) === "given" && (await giveFeedback("S1", "p1", ["total", "q1:5"], [{ q: "q5", text: "пак" }])) === "already" && (await feedbackGiven("S1", "p1")) && !(await feedbackGiven("S1", "p2")));
await giveFeedback("S1", "p2", ["total", "q1:4"], [{ q: "q5", text: "бързо" }]);
const fb = await feedbackOf("S1");
const rec = (globalThis as unknown as { __ptsSchemeFeedback: Map<string, { given: string[] }> }).__ptsSchemeFeedback.get("S1")!;
t("the scheme's feedback: the counters and the sorted words — nothing of who or when; «given» kept sorted, apart from the answers", fb.counts.total === 2 && fb.counts["q1:5"] === 1 && fb.counts["q1:4"] === 1 && JSON.stringify(fb.words) === JSON.stringify([{ q: "q5", text: "бързо" }, { q: "q5", text: "добре" }]) && !JSON.stringify(fb).includes("p1") && rec.given.join() === "p1,p2");

// ── the wiring ──
const act = src("lib/actions.ts");
const i = act.indexOf("export async function giveFeedbackAction(");
const fn = act.slice(i, act.indexOf("\n}\n", i));
t("the action: the participation's own session; after the report; NO journal line, no account, no time (К21)", i > 0 && /participantViewer\(\)/.test(fn) && /feedbackOffered\(/.test(fn) && !/logActivity|logAs|new Date|toISOString/.test(fn));
const store = src("lib/feedback.ts");
t("the store writes no time, no account, no journal", !/logActivity|logAs|new Date|toISOString|_at\b/.test(store));
const mig = readFileSync(new URL("../supabase/migrations/0053_feedback.sql", import.meta.url), "utf8");
const migSql = mig.replace(/--.*$/gm, "");
t("10.3 review: ONE row per scheme, rewritten whole at every give (the words reshuffled, «given» sorted) — no row of one give, no time", /create table if not exists public\.scheme_feedback/.test(migSql) && !/feedback_words|feedback_given|feedback_counts/.test(migSql) && /for update/.test(migSql) && /order by random\(\)/.test(migSql) && /unnest\(r\.given \|\| p_participant\) as g order by g/.test(migSql) && !/timestamptz|now\(\)|_at\b/.test(migSql));
t("…«given» asked in a call's body, never in a logged address", /rpc\("feedback_is_given"/.test(store) && !/from\("scheme_feedback"\)\.select\([^)]*given/.test(store));
t("the laboratory's page offers it and points complaints to the site's form (П 7.6)", /<FeedbackForm [^>]*complaintsUrl=\{COMPLAINTS_URL\}/.test(src("app/lab/p/[id]/page.tsx")) && /data-feedback-complaints/.test(src("components/FeedbackForm.tsx")));
t("10.3 review: the round export as the panel — only once shown; never «given»", /const fbShown = feedbackShown\(/.test(src("lib/round-export.ts")) && /fbShown \?/.test(src("lib/round-export.ts")) && !/given/.test(src("lib/round-export.ts").slice(src("lib/round-export.ts").indexOf("const fb = await feedbackOf"), src("lib/round-export.ts").indexOf("const fb = await feedbackOf") + 900)));

console.log(`feedback.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
