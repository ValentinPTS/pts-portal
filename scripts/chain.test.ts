// The calibration chain. The assertions that matter most are the ones about what
// a laboratory can learn: it must never be able to see past its own next stop.
import {
  isDone, isHolding, isFrozen, holderIndex, nextStopIndex, nextStopFor,
  stopIndexesForCode, labState, positionOf, stopsAhead, paceDays,
  estimatedWaitDays, describeWait, chainComplete, reorderPending, ordinalSuffixBg, isIncomingFor,
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
  // BBB is holding the device at this point. It has not sent it on, so from CCC's
  // side one whole stop — the rest of BBB's work plus the courier — is still ahead.
  ok("the lab currently holding the device still counts as ahead", stopsAhead(mid, "CCC") === 1);
  // The round's own measured pace (6.5 days a stop here) beats the owner's guess of
  // 10, so one stop ahead reads as a week — the point is that it is a real wait and
  // not the "съвсем скоро" the old count produced.
  ok("and that turns into a real wait, not \"very soon\"",
    estimatedWaitDays(mid, "CCC") === 7 && !/скоро/.test(describeWait(estimatedWaitDays(mid, "CCC"), "bg")));
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
// singular/plural — every participant reads this line every round
ok("one day is a day, not days", describeWait(1, "bg") === "около 1 ден");
ok("one day in English too", describeWait(1, "en") === "about 1 day");
ok("two days stay plural", describeWait(2, "bg") === "около 2 дни");
ok("one week is a week", describeWait(10, "bg") === "около 1 седмица");
ok("one week in English too", describeWait(10, "en") === "about 1 week");
ok("several weeks stay plural", describeWait(28, "bg") === "около 4 седмици");
ok("months stay plural", describeWait(120, "bg") === "около 4 месеца");
ok("no phrase is ever left with a bare number", [1, 2, 5, 9, 10, 20, 40, 60, 120, 400]
  .every((d) => /\d+\s+\S+/.test(describeWait(d, "bg")) && /\d+\s+\S+/.test(describeWait(d, "en"))));
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

// ── Bulgarian ordinals ───────────────────────────────────────────────────────
// The queue position is read by every laboratory in every calibration round, so a
// wrong suffix is the most-seen typo in the app. The teens are the trap: Bulgarian
// says единадесети/четиринадесети, so 11-19 take "-и" regardless of last digit.
{
  const o = ordinalSuffixBg;
  ok("1 is 1-ви (първи)", o(1) === "ви");
  ok("2 is 2-ри (втори)", o(2) === "ри");
  ok("3 is 3-ти (трети)", o(3) === "ти");
  ok("4 is 4-ти (четвърти)", o(4) === "ти");
  ok("5 is 5-и (пети)", o(5) === "и");
  ok("9 is 9-и (девети)", o(9) === "и");
  ok("10 is 10-и (десети)", o(10) === "и");
  ok("11 is 11-и, not 11-ви (единадесети)", o(11) === "и");
  ok("12 is 12-и, not 12-ри (дванадесети)", o(12) === "и");
  ok("13 is 13-и, not 13-ти (тринадесети)", o(13) === "и");
  ok("14 is 14-и, not 14-ти (четиринадесети)", o(14) === "и");
  ok("19 is 19-и (деветнадесети)", o(19) === "и");
  ok("20 is 20-и (двадесети)", o(20) === "и");
  ok("21 is 21-ви (двадесет и първи)", o(21) === "ви");
  ok("22 is 22-ри (двадесет и втори)", o(22) === "ри");
  ok("23 is 23-ти (двадесет и трети)", o(23) === "ти");
  ok("24 is 24-ти (двадесет и четвърти)", o(24) === "ти");
  ok("25 is 25-и (двадесет и пети)", o(25) === "и");
  ok("111 is 111-и (сто и единадесети)", o(111) === "и");
  ok("121 is 121-ви", o(121) === "ви");
  ok("every position 1..60 gets a suffix", Array.from({ length: 60 }, (_, i) => o(i + 1)).every((x) => x.length > 0));
}

// ── "the device is on its way to you" ────────────────────────────────────────
// The trap this guards: a laboratory that is HOLDING the device has already
// received it, so it no longer counts as a stop "ahead" — derive the in-transit
// flag from that and the lab after the holder is told the device is travelling to
// it while the holder still has it on the bench.
{
  const mk = (stops: ChainStop[], dispatchedAt?: string): SchemeChain => ({ stops, dispatchedAt });
  const A: ChainStop = { id: "a", kind: "lab", code: "A" };
  const R: ChainStop = { id: "r", kind: "ref" };
  const B: ChainStop = { id: "b", kind: "lab", code: "B" };

  ok("nothing is incoming before dispatch", !isIncomingFor(mk([A, R, B]), "A"));

  const justSent = mk([A, R, B], "2026-01-01");
  ok("after dispatch it is on its way to the first stop", isIncomingFor(justSent, "A"));
  ok("but not to the ones behind it", !isIncomingFor(justSent, "B"));

  const aHolds = mk([{ ...A, receivedAt: "2026-01-03" }, R, B], "2026-01-01");
  ok("while A holds it, it is on its way to nobody", !isIncomingFor(aHolds, "A") && !isIncomingFor(aHolds, "B"));

  const aSent = mk([{ ...A, receivedAt: "2026-01-03", sentAt: "2026-01-09" }, R, B], "2026-01-01");
  ok("the reference lab is next, and it is not a participant code", !isIncomingFor(aSent, "B"));

  const refDone = mk([
    { ...A, receivedAt: "2026-01-03", sentAt: "2026-01-09" },
    { ...R, receivedAt: "2026-01-11", sentAt: "2026-01-15" },
    B,
  ], "2026-01-01");
  ok("once the reference lab sends it on, B is the one expecting it", isIncomingFor(refDone, "B"));

  // THE REGRESSION: a holder mid-chain must not make the next lab think it is coming.
  const C: ChainStop = { id: "c", kind: "lab", code: "C" };
  const bHolds = mk([
    { ...A, receivedAt: "2026-01-03", sentAt: "2026-01-09" },
    { ...B, receivedAt: "2026-01-12" },
    C,
  ], "2026-01-01");
  ok("a mid-chain holder does not make the NEXT lab think it is travelling", !isIncomingFor(bHolds, "C"));
  ok("and the holder is not told it is incoming either", !isIncomingFor(bHolds, "B"));

  const allDone = mk([
    { ...A, receivedAt: "2026-01-03", sentAt: "2026-01-09" },
    { ...B, receivedAt: "2026-01-12", sentAt: "2026-01-20" },
  ], "2026-01-01");
  ok("when the chain is finished nothing is incoming", !isIncomingFor(allDone, "A") && !isIncomingFor(allDone, "B"));
  ok("an unknown code is never told anything", !isIncomingFor(refDone, "ZZZ"));
}

console.log(`chain.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
