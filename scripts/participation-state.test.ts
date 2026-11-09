// Plan part 5.5 — the participation's state, read from the record; a FIXED state → stage
// map (К26); payment beside the bar, never a stage (К18; Реш. 96); «изчаква избор на
// доставчик» outside the EU and the Balkans (Реш. 128).
import { participationState, STATE_STAGE, STAGES, STATE_LABEL, STAGE_LABEL, paymentMark, PAYMENT_LABEL, needsCarrierChoice, finished, type PState } from "../src/lib/participation-state-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const on = { finalList: true, onList: true, coded: true };
eq("from the record, in order: applied → confirmed → dispatched → received → submitted → scored", [
  participationState({}), participationState(on), participationState({ ...on, dispatched: true }), participationState({ ...on, dispatched: true, received: true }),
  participationState({ ...on, received: true, submitted: true }), participationState({ ...on, submitted: true, reported: true }),
], ["applied", "confirmed", "dispatched", "received", "submitted", "scored"]);
eq("…outside the EU and the Balkans, the carrier not chosen: «изчаква избор на доставчик» (Реш. 128) — until it is dispatched", [participationState({ ...on, carrierPending: true }), participationState({ ...on, carrierPending: true, dispatched: true })], ["carrier", "dispatched"]);
eq("…the report issued without its result: N/R (Реш. 19)", participationState({ ...on, received: true, reported: true }), "nr");
eq("…ends: refused, annulled, withdrawn; not on the final list; the scheme not held", [participationState({ standing: "withdrawn", ...on }), participationState({ standing: "refused" }), participationState({ finalList: true, onList: false }), participationState({ notHeld: true })], ["withdrawn", "refused", "not-final", "not-held"]);
t("К26: every state has its stage (or none — it ended), and every stage its words", (Object.keys(STATE_STAGE) as PState[]).every((s) => STATE_STAGE[s] === null || STAGES.includes(STATE_STAGE[s]!)) && STAGES.every((s) => !!STAGE_LABEL[s].bg && !!STAGE_LABEL[s].en) && Object.values(STATE_LABEL).every((v) => !!v.bg && !!v.en));
t("К18: payment is no stage — a mark beside the bar", !STAGES.includes("payment" as never) && paymentMark(false, false) === "none" && paymentMark(true, false) === "invoiced" && paymentMark(true, true) === "paid" && Object.values(PAYMENT_LABEL).every((v) => !!v.bg && !!v.en));
eq("the carrier is chosen outside the EU and the Balkans only", ["BG", "de", "RS", "XK", "EL", "TR", "US", "UA", undefined].map((c) => needsCarrierChoice(c)), [false, false, false, false, false, true, true, true, false]);
eq("finished — in the archive: scored, N/R, or ended", (["applied", "received", "scored", "nr", "withdrawn", "not-held"] as PState[]).map(finished), [false, false, true, true, true, true]);

console.log(`participation-state.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
