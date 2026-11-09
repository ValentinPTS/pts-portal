// The calibration chain. The assertions that matter most are the ones about what
// a laboratory can learn: it must never be able to see past its own next stop.
import {
  isDone, isHolding, isFrozen, holderIndex, nextStopIndex, nextStopFor,
  stopIndexesForCode, labState, positionOf, stopsAhead, paceDays,
  estimatedWaitDays, describeWait, chainComplete, reorderPending, ordinalSuffixBg, isIncomingFor,
  stampProblem, applyStamp, isStampSource, stampSourceLabel, sofiaDay, sofiaTime, fmtStamp, CHAIN_STAMP_SOURCES,
  returnProblem, rebuildChain, sofiaWallToIso, sofiaNowWall,
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
{
  // THE REGRESSION. One hop is a single observation, and the first hop of a round is
  // the fastest one: the provider ships to the nearest lab, and the reference lab is
  // quick because it is the anchor. Trusting it told everyone behind "about 4 days"
  // when the owner's own figure said four weeks — wrong by seven times, and wrong
  // exactly while the laboratories were first asking.
  const oneHop: SchemeChain = {
    stops: [lab("a", "AAA", D(1), D(2)), ref("r", D(3)), lab("c", "CCC")],
    daysPerLab: 14,
  };
  ok("a single hop does not override his figure", paceDays(oneHop) === 14);
  ok("and the estimate stays his, not the noise", estimatedWaitDays(oneHop, "CCC") === 14);

  // with no figure of his own there is nothing to fall back to — say nothing
  const noGuess: SchemeChain = { stops: [lab("a", "AAA", D(1), D(2)), ref("r", D(3)), lab("c", "CCC")] };
  ok("one hop and no figure invents nothing", paceDays(noGuess) === null);
  ok("and so no wait is shown at all", estimatedWaitDays(noGuess, "CCC") === null);

  // two hops IS enough — this is the point at which the round speaks for itself
  const twoHops: SchemeChain = {
    stops: [lab("a", "AAA", D(1), D(2)), ref("r", D(3), D(4)), lab("c", "CCC", D(21)), lab("d", "DDD")],
    daysPerLab: 14,
  };
  ok("two hops replace his figure", paceDays(twoHops) === 10);

  // a device cannot really move stop to stop in hours; that is clustered receipts
  const sameDay: SchemeChain = {
    stops: [
      { id: "a", kind: "lab", code: "AAA", receivedAt: "2026-08-01T09:00:00Z", sentAt: "2026-08-01T10:00:00Z" },
      { id: "r", kind: "ref", receivedAt: "2026-08-01T11:00:00Z", sentAt: "2026-08-01T12:00:00Z" },
      { id: "c", kind: "lab", code: "CCC", receivedAt: "2026-08-01T13:00:00Z" },
      { id: "d", kind: "lab", code: "DDD" },
    ],
    daysPerLab: 14,
  };
  ok("an implausibly fast measurement is ignored", paceDays(sameDay) === 14);
  ok("a clustered round never says \"very soon\" to the lab behind",
    !/скоро/.test(describeWait(estimatedWaitDays(sameDay, "DDD"), "bg")));
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

// ── PTS stamps a stop on its behalf (part 0.10, N25 / E6.c) ─────────────────
{
  const NOW = Date.parse("2026-08-20T12:00:00Z");
  const T = (iso: string) => Date.parse(iso);
  // reference before, two labs, reference after — dispatched, nothing received yet
  const fresh: SchemeChain = { stops: [ref("r1"), lab("a", "AAA"), lab("b", "BBB"), ref("r2")], dispatchedAt: D(1) };

  ok("a LEADING reference stop can be stamped as arrived — it no longer stalls the chain",
    stampProblem(fresh, "r1", "received", T(D(2)), NOW) === null);
  ok("…but not before PTS has sent the device",
    stampProblem({ ...fresh, dispatchedAt: undefined }, "r1", "received", T(D(2)), NOW) === "not-dispatched");
  ok("arrivals go in order: the second stop cannot arrive first",
    stampProblem(fresh, "a", "received", T(D(2)), NOW) === "order");
  ok("a handover needs the arrival first", stampProblem(fresh, "r1", "sent", T(D(2)), NOW) === "not-received");
  ok("an unknown stop is refused", stampProblem(fresh, "zzz", "received", T(D(2)), NOW) === "missing");
  ok("no chain at all is refused", stampProblem(undefined, "r1", "received", T(D(2)), NOW) === "missing");
  ok("the future is refused", stampProblem(fresh, "r1", "received", NOW + 3_600_000, NOW) === "future");
  ok("…but a clock four minutes fast is not the future", stampProblem(fresh, "r1", "received", NOW + 4 * 60_000, NOW) === null);
  ok("…while six minutes ahead is", stampProblem(fresh, "r1", "received", NOW + 6 * 60_000, NOW) === "future");
  ok("a time that is not a time is refused", stampProblem(fresh, "r1", "received", NaN, NOW) === "time");

  const refHolds: SchemeChain = { ...fresh, stops: applyStamp(fresh.stops, "r1", "received", D(2), { by: "pts", recordedAt: D(2), source: "phone" }) };
  ok("applyStamp sets the arrival and who recorded it",
    refHolds.stops[0].receivedAt === D(2) && refHolds.stops[0].received?.by === "pts" && refHolds.stops[0].received?.source === "phone");
  ok("applyStamp touches no other stop", refHolds.stops.slice(1).every((s, i) => s === fresh.stops[i + 1]));
  ok("applyStamp returns a fresh array", refHolds.stops !== fresh.stops);
  ok("the reference stop now holds the device", holderIndex(refHolds) === 0);
  ok("the next lab cannot arrive while the reference still holds it",
    stampProblem(refHolds, "a", "received", T(D(3)), NOW) === "previous-holding");
  ok("the same arrival cannot be stamped twice", stampProblem(refHolds, "r1", "received", T(D(3)), NOW) === "already");
  ok("a handover before the arrival is refused", stampProblem(refHolds, "r1", "sent", T(D(1)), NOW) === "before-receipt");
  ok("a handover after the arrival is accepted", stampProblem(refHolds, "r1", "sent", T(D(3)), NOW) === null);

  const refSent: SchemeChain = { ...refHolds, stops: applyStamp(refHolds.stops, "r1", "sent", D(3), { by: "pts", recordedAt: D(3), source: "courier" }) };
  ok("after the reference hands it on, the first lab is told it is coming", isIncomingFor(refSent, "AAA"));
  ok("…and PTS may now record that lab's arrival", stampProblem(refSent, "a", "received", T(D(5)), NOW) === null);
  ok("the handover cannot be stamped twice", stampProblem(refSent, "r1", "sent", T(D(4)), NOW) === "already");

  // walk it to the end: the TRAILING reference stop can be stamped too
  let c: SchemeChain = refSent;
  const pts = { by: "pts" as const, recordedAt: D(19), source: "phone" as const };
  for (const [id, r, s] of [["a", 5, 9], ["b", 11, 15], ["r2", 17, 18]] as const) {
    ok(`stop ${id} can be stamped as arrived in turn`, stampProblem(c, id, "received", T(D(r)), NOW) === null);
    c = { ...c, stops: applyStamp(c.stops, id, "received", D(r), pts) };
    ok(`stop ${id} can be stamped as handed on`, stampProblem(c, id, "sent", T(D(s)), NOW) === null);
    c = { ...c, stops: applyStamp(c.stops, id, "sent", D(s), pts) };
  }
  ok("with the trailing reference stamped, the chain is complete", chainComplete(c));
  ok("a closed chain takes no stamps — even one that would otherwise be fine",
    stampProblem(refSent, "a", "received", T(D(5)), NOW) === null
    && stampProblem({ ...refSent, returnedAt: D(19) }, "a", "received", T(D(5)), NOW) === "closed"
    && stampProblem({ ...refSent, returnedAt: D(19) }, "a", "received", T(D(5)), NOW, "lab") === "closed");

  // chronology — the record the waiting labs' estimate is computed from
  ok("no arrival before PTS sent the device", stampProblem(fresh, "r1", "received", T("2026-07-31T09:00:00Z"), NOW) === "before-dispatch");
  ok("a mistyped year (0026) cannot slip through", stampProblem(fresh, "r1", "received", Date.UTC(26, 10, 2), NOW) === "before-dispatch");
  ok("chronology is to the minute: an arrival typed 09:00 fits a dispatch pressed at 09:00:42",
    stampProblem({ ...fresh, dispatchedAt: "2026-08-01T09:00:42Z" }, "r1", "received", T("2026-08-01T09:00:00Z"), NOW) === null
    && stampProblem({ ...fresh, dispatchedAt: "2026-08-01T09:00:42Z" }, "r1", "received", T("2026-08-01T08:59:00Z"), NOW) === "before-dispatch");
  ok("no arrival before the previous stop handed on", stampProblem(refSent, "a", "received", T(D(2)), NOW) === "before-previous");
  ok("…the moment of the handover itself is fine", stampProblem(refSent, "a", "received", T(D(3)), NOW) === null);
  // a lab that has the device may confirm even while the stop before has not pressed
  const aHolds: SchemeChain = { ...refSent, stops: applyStamp(refSent.stops, "a", "received", D(5), pts) };
  ok("a LAB may confirm its arrival while the stop before has not pressed «handed on»",
    stampProblem(aHolds, "b", "received", T(D(11)), NOW, "lab") === null);
  ok("…PTS may not: it records the silent stop's handover first",
    stampProblem(aHolds, "b", "received", T(D(11)), NOW) === "previous-holding");
  const bAlso: SchemeChain = { ...aHolds, stops: applyStamp(aHolds.stops, "b", "received", D(11), { by: "lab", recordedAt: D(11) }) };
  ok("then the silent stop's handover cannot be after the next arrival",
    stampProblem(bAlso, "a", "sent", T(D(12)), NOW) === "after-next-arrival");
  ok("…but before it, it can", stampProblem(bAlso, "a", "sent", T(D(10)), NOW) === null);
  ok("a lab is held to the order too: no arrival out of turn",
    stampProblem(refSent, "b", "received", NOW, NOW, "lab") === "order");
  ok("…and none before the device has left PTS",
    stampProblem({ ...fresh, dispatchedAt: undefined }, "a", "received", NOW, NOW, "lab") === "not-dispatched");
  ok("a lab cannot hand on what it has not received", stampProblem(refSent, "a", "sent", NOW, NOW, "lab") === "not-received");

  // closing the chain
  ok("the chain cannot close before the device left", returnProblem({ ...fresh, dispatchedAt: undefined }) === "not-dispatched");
  ok("…nor while a stop is still open — that would strand it", returnProblem(refSent) === "open-stops");
  ok("it closes once every stop has handed on", returnProblem(c) === null);
  ok("…and only once", returnProblem({ ...c, returnedAt: D(19) }) === "already");
  ok("no chain at all cannot close", returnProblem(undefined) === "not-dispatched");

  // saving a new order from a screen loaded before a stop was reached
  {
    let n = 0;
    const mint = () => `new${++n}`;
    const cur = [ref("r1", D(1)), lab("a", "AAA"), lab("b", "BBB")];
    const out = rebuildChain(cur, [{ id: "b", kind: "lab", code: "BBB" }, { id: "r1", kind: "ref" }, { id: "a", kind: "lab", code: "AAA" }, { kind: "lab", code: "CCC" }], mint);
    ok("a frozen stop stays first, exactly as it was", out[0] === cur[0]);
    ok("a stale id of a FROZEN stop is not added a second time", out.filter((s) => s.id === "r1").length === 1 && out.length === 4);
    ok("pending stops are reused by id, in the new order", out[1] === cur[2] && out[2] === cur[1]);
    ok("a new stop gets a fresh id", out[3].id === "new1" && out[3].code === "CCC" && n === 1);
    const reached = [ref("r1", D(1), D(2)), lab("a", "AAA", D(3)), lab("b", "BBB")];
    const out2 = rebuildChain(reached, [{ id: "a", kind: "lab", code: "AAA" }, { id: "b", kind: "lab", code: "BBB" }], mint);
    ok("a lab reached since the screen loaded is not duplicated", out2.filter((s) => s.code === "AAA").length === 1 && out2.length === 3);
    ok("…and an omitted pending stop is dropped", rebuildChain(cur, [{ id: "a", kind: "lab", code: "AAA" }], mint).map((s) => s.id).join() === "r1,a");
  }

  // a lab's own stamps and PTS's coexist: a lab that already confirmed is "already"
  const labDid: SchemeChain = { ...refSent, stops: applyStamp(refSent.stops, "a", "received", D(5), { by: "lab", recordedAt: D(5) }) };
  ok("a lab's own confirmation counts — PTS is not asked to repeat it",
    stampProblem(labDid, "a", "received", T(D(6)), NOW) === "already" && labDid.stops[1].received?.by === "lab");

  ok("every source is a known source", CHAIN_STAMP_SOURCES.every(isStampSource));
  ok("an unknown source is not", !isStampSource("fax") && !isStampSource(undefined) && !isStampSource(""));
  ok("every source has a label in both languages",
    CHAIN_STAMP_SOURCES.every((s) => stampSourceLabel(s, "bg") && stampSourceLabel(s, "en")));
  ok("no source → no label", stampSourceLabel(undefined, "bg") === "");

  // Bulgarian time, wherever the server runs: 22:30 UTC in summer is 01:30 next day in Sofia
  ok("the case-file day is the day in Sofia, not in UTC", sofiaDay("2026-08-04T22:30:00Z") === "2026-08-05");
  ok("…and the time is Sofia time (EEST, +3)", sofiaTime("2026-08-04T22:30:00Z") === "01:30");
  ok("in winter Sofia is +2", sofiaTime("2026-01-15T10:05:00Z") === "12:05");
  ok("midnight is 00, never 24", sofiaTime("2026-01-14T22:00:00Z") === "00:00");
  ok("a chain step shows date AND time", fmtStamp("2026-08-04T09:07:00Z") === "04.08.2026 12:07");
  ok("nothing in → nothing out", fmtStamp(undefined) === "" && sofiaDay("not a date") === "" && sofiaTime("") === "");

  // what PTS types is Bulgarian wall-clock time, whatever the browser's zone
  ok("a winter time is +2", sofiaWallToIso("2026-11-02T14:30") === "2026-11-02T12:30:00.000Z");
  ok("a summer time is +3", sofiaWallToIso("2026-08-04T12:07") === "2026-08-04T09:07:00.000Z");
  ok("the day summer time starts: before and after the change",
    sofiaWallToIso("2026-03-29T01:00") === "2026-03-28T23:00:00.000Z" && sofiaWallToIso("2026-03-29T12:00") === "2026-03-29T09:00:00.000Z");
  ok("the day it ends", sofiaWallToIso("2026-10-25T12:00") === "2026-10-25T10:00:00.000Z");
  ok("typed → shown is the same wall-clock time", fmtStamp(sofiaWallToIso("2026-12-31T23:59") ?? "") === "31.12.2026 23:59");
  ok("a mistyped year is refused", sofiaWallToIso("0026-11-02T10:00") === null);
  ok("a date that does not exist is refused", sofiaWallToIso("2026-02-30T10:00") === null);
  ok("24:00 is refused", sofiaWallToIso("2026-11-02T24:00") === null);
  ok("anything else is refused", sofiaWallToIso("2026-11-02 14:30") === null && sofiaWallToIso("") === null && sofiaWallToIso("2026-11-02T14:30Z") === null);
  ok("now, as the form's default, in Sofia", sofiaNowWall(Date.parse("2026-11-02T12:30:40Z")) === "2026-11-02T14:30");
}

console.log(`chain.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
