// The calibration chain. The assertions that matter most are the ones about what
// a laboratory can learn: it must never be able to see past its own next stop.
import {
  isDone, isHolding, isFrozen, holderIndex, nextStopIndex, nextStopFor,
  stopIndexesForCode, labState, positionOf, stopsAhead, paceDays,
  estimatedWaitDays, describeWait, chainComplete, reorderPending,
} from "../src/lib/chain.ts";
import type { ChainStop, SchemeChain } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };

const lab = (id: string, code: string, r?: string, s?: string): ChainStop =>
  ({ id, kind: "lab", code, receivedAt: r, sentAt: s });
const ref = (id: string, r?: string, s?: string): ChainStop =>
  ({ id, kind: "ref", receivedAt: r, sentAt: s });
const D = (d: number) => `2026-08-${String(d).padStart(2, "0")}T09:00:00Z`;

// Reference first, three labs, reference again — the shape the stability formula implies.
const mid: SchemeChain = {
  stops: [
    ref("r1", D(1), D(3)),
    lab("s1", "AAA", D(5), D(12)),
    lab("s2", "BBB", D(14)),          // holds it now
    lab("s3", "CCC"),                 // still waiting
    ref("r2"),
  ],
  daysPerLab: 10,
};

// ── stop states ──────────────────────────────────────────────────────────────
ok("a stop that handed it on is done", isDone(mid.stops[1]));
ok("the current stop is not done", !isDone(mid.stops[2]));
ok("the current stop is holding", isHolding(mid.stops[2]));
ok("a passed stop is not holding", !isHolding(mid.stops[1]));
ok("an untouched stop is not holding", !isHolding(mid.stops[3]));
ok("anything that received it is frozen", isFrozen(mid.stops[0]) && isFrozen(mid.stops[2]));
ok("an untouched stop is not frozen", !isFrozen(mid.stops[3]) && !isFrozen(mid.stops[4]));

// ── where the device is ──────────────────────────────────────────────────────
ok("the holder is found", holderIndex(mid) === 2);
ok("nobody holds an empty chain", holderIndex(undefined) === -1);
ok("in transit → no holder", holderIndex({ stops: [lab("a", "AAA", D(1), D(2)), lab("b", "BBB")] }) === -1);
ok("next stop is the first not yet reached", nextStopIndex(mid) === 3);
ok("a finished chain has no next stop",
  nextStopIndex({ stops: [lab("a", "AAA", D(1), D(2))] }) === -1);

// ── the confidentiality boundary ─────────────────────────────────────────────
{
  const next = nextStopFor(mid, 2);
  ok("the holder's next stop is the one immediately after", next?.id === "s3");
  ok("the next stop carries a CODE and no name", next?.code === "CCC" && !("labName" in (next ?? {})));
  ok("the LAST stop has no next", nextStopFor(mid, 4) === null);
  ok("an out-of-range index has no next", nextStopFor(mid, 99) === null && nextStopFor(mid, -1) === null);
  // The module must never hand back more than one stop ahead — that is the whole
  // reason a lab learns exactly two others in the round.
  ok("there is no way to ask for two stops ahead", nextStopFor(mid, 2)?.id !== "r2");
}

// ── per-lab state ────────────────────────────────────────────────────────────
ok("a lab that already passed it is done", labState(mid, "AAA") === "done");
ok("the holder is holding", labState(mid, "BBB") === "holding");
ok("a lab still to come is waiting", labState(mid, "CCC") === "waiting");
ok("a lab not in the chain is told so", labState(mid, "ZZZ") === "not-in-chain");
ok("no chain at all → not in chain", labState(undefined, "AAA") === "not-in-chain");
{
  // a lab routed to twice: holding wins, and it is only done when both are past
  const twice: SchemeChain = { stops: [lab("a", "AAA", D(1), D(2)), lab("b", "BBB", D(3)), lab("c", "AAA")] };
  ok("a repeat visit keeps the lab waiting, not done", labState(twice, "AAA") === "waiting");
  const twiceHolding: SchemeChain = { stops: [lab("a", "AAA", D(1), D(2)), lab("c", "AAA", D(4))] };
  ok("holding beats done for a repeat visit", labState(twiceHolding, "AAA") === "holding");
}
ok("both stops of a code are found", JSON.stringify(stopIndexesForCode(
  { stops: [lab("a", "AAA"), lab("b", "BBB"), lab("c", "AAA")] }, "AAA")) === "[0,2]");

// ── position and queue ───────────────────────────────────────────────────────
{
  const p = positionOf(mid, "CCC");
  ok("position counts every stop, reference included", p?.position === 4 && p?.total === 5);
  ok("a lab not in the chain has no position", positionOf(mid, "ZZZ") === null);
  ok("stops ahead counts only what has NOT been reached", stopsAhead(mid, "CCC") === 0);
}
{
  // nothing has moved yet: the third lab has two stops ahead of it
  const fresh: SchemeChain = { stops: [lab("a", "AAA"), lab("b", "BBB"), lab("c", "CCC")], daysPerLab: 7 };
  ok("stops ahead on a fresh chain", stopsAhead(fresh, "CCC") === 2);
  ok("the first lab waits for nobody", stopsAhead(fresh, "AAA") === 0);
}
ok("a lab that already had it has nothing ahead", stopsAhead(mid, "AAA") === 0);

// ── pace: his guess first, the round's own truth after ───────────────────────
ok("with no history, his number is used", paceDays({ stops: [lab("a", "AAA")], daysPerLab: 9 }) === 9);
ok("with no history and no number, nothing is invented", paceDays({ stops: [lab("a", "AAA")] }) === null);
ok("a nonsense number is ignored", paceDays({ stops: [lab("a", "AAA")], daysPerLab: 0 }) === null);
{
  // received on the 1st, 5th and 13th → 12 days over 2 hops = 6, NOT his 10
  const measured: SchemeChain = {
    stops: [lab("a", "AAA", D(1), D(4)), lab("b", "BBB", D(5), D(12)), lab("c", "CCC", D(13))],
    daysPerLab: 10,
  };
  ok("the round's real pace replaces the guess", paceDays(measured) === 6);
}

// ── the estimate ─────────────────────────────────────────────────────────────
{
  const fresh: SchemeChain = { stops: [lab("a", "AAA"), lab("b", "BBB"), lab("c", "CCC")], daysPerLab: 7 };
  ok("two stops ahead at 7 days each ≈ 14", estimatedWaitDays(fresh, "CCC") === 14);
  ok("the holder is given no wait", estimatedWaitDays(mid, "BBB") === null);
  ok("a finished lab is given no wait", estimatedWaitDays(mid, "AAA") === null);
  ok("a lab outside the chain gets nothing", estimatedWaitDays(fresh, "ZZZ") === null);
  ok("no pace, no estimate — nothing invented",
    estimatedWaitDays({ stops: [lab("a", "AAA"), lab("b", "BBB")] }, "BBB") === null);
}

// ── how it is worded: coarse on purpose, never a date ────────────────────────
ok("nothing to say stays silent", describeWait(null, "bg") === "");
ok("days for a short wait", describeWait(5, "bg").includes("5"));
ok("weeks for a medium wait", /седмиц/.test(describeWait(28, "bg")));
ok("months for a long wait", /месец/.test(describeWait(120, "bg")));
ok("English is worded too", describeWait(28, "en").includes("weeks"));
ok("no estimate ever contains a date",
  [3, 28, 120].every((d) => !/\d{4}|\.\d{2}\./.test(describeWait(d, "bg"))));

// ── completion ───────────────────────────────────────────────────────────────
ok("a chain in progress is not complete", !chainComplete(mid));
ok("an empty chain is not complete", !chainComplete({ stops: [] }) && !chainComplete(undefined));
ok("all stops passed → complete",
  chainComplete({ stops: [lab("a", "AAA", D(1), D(2)), ref("r", D(3), D(4))] }));

// ── reordering: history is untouchable ───────────────────────────────────────
{
  const out = reorderPending(mid.stops, ["r2", "s3"]); // swap the two pending stops
  ok("frozen stops keep their order", JSON.stringify(out.slice(0, 3).map((s) => s.id)) === '["r1","s1","s2"]');
  ok("pending stops follow the new order", JSON.stringify(out.slice(3).map((s) => s.id)) === '["r2","s3"]');
  ok("nothing is lost", out.length === mid.stops.length);
}
{
  const dropped = reorderPending(mid.stops, ["s3"]); // r2 omitted → removed
  ok("an omitted pending stop is dropped", dropped.length === 4 && !dropped.some((s) => s.id === "r2"));
  ok("dropping cannot touch a frozen stop", dropped.filter((s) => s.receivedAt).length === 3);
}
{
  const evil = reorderPending(mid.stops, ["s1", "r1", "s3", "r2"]); // frozen ids listed
  ok("naming a frozen stop cannot move it",
    JSON.stringify(evil.map((s) => s.id)) === '["r1","s1","s2","s3","r2"]');
  ok("an unknown id is ignored", reorderPending(mid.stops, ["nope", "s3"]).length === 4);
}

console.log(`chain.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
