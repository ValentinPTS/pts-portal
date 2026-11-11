"use client";

import { useEffect, useRef, useState } from "react";
import { saveResultDraftAction } from "@/lib/actions";

// A results draft's saving (plan parts 6.1, 6.2) — for the testing form and the calibration one
// alike. What is typed is kept exactly as typed, saved a few seconds after typing stops (an
// unchanged form is not sent again) and by the form's own button. Each save names the draft's
// revision it was typed over: a newer one stored meanwhile (another tab, another user of the
// participation, a page brought back by «Back») is never overwritten — the form says so and
// stops. «Saved» is said only when nothing changed since the save was sent; leaving with changes
// unsaved asks first.

export type Values = Record<string, string>;
export type SaveState = { kind: "idle" | "dirty" | "saving" | "saved" | "stale" | "error"; at?: string; error?: string };
const AUTOSAVE_MS = 4000; // a few seconds after typing stops — each save is a sign-in check on record

// The latest draft this browser tab saved, per participation — and the save in flight. «Back» brings the
// form back from the router's cache with the revision and the values it was first shown with, though the
// form saved since (on leaving, UL-2): the next save was refused as «saved elsewhere» and what was typed
// after was lost (the security sweep, round 2, R2U-1). What this tab saved itself is taken up again.
type Saved = { rev: number; values: Values; savedAt?: string };
const g = globalThis as unknown as { __ptsDraftSaved?: Map<string, Saved>; __ptsDraftInFlight?: Map<string, Promise<unknown>> };
const ownSaved: Map<string, Saved> = g.__ptsDraftSaved ?? (g.__ptsDraftSaved = new Map());
const ownInFlight: Map<string, Promise<unknown>> = g.__ptsDraftInFlight ?? (g.__ptsDraftInFlight = new Map());

export function useDraftSaver({ schemeId, participantId, initial, rev, savedAt }: { schemeId: string; participantId: string; initial: Values; rev: number; savedAt?: string }) {
  const [values, setValues] = useState<Values>(initial);
  const [state, setState] = useState<SaveState>(savedAt ? { kind: "saved", at: savedAt } : { kind: "idle" });
  const [bad, setBad] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(initial); // the values as typed — kept in step by change(), never in render
  const edits = useRef(0);
  const baseRev = useRef(rev);
  const lastSent = useRef(JSON.stringify(initial));
  const stopped = useRef(false);
  const inFlight = useRef(false);   // one save at a time — a second would name the same revision
  const again = useRef(false);      // asked for while one was in flight: run once it returns

  const key = `${schemeId}|${participantId}`;
  // brought back with an older revision than this tab saved (R2U-1): its own latest taken up, once any
  // save of its own still in flight is back — never over what was typed meanwhile
  useEffect(() => {
    let alive = true;
    void (async () => {
      const flying = ownInFlight.get(key);
      if (flying) await flying.catch(() => null);
      const mine = ownSaved.get(key);
      if (!alive || !mine || mine.rev <= baseRev.current || edits.current > 0) return;
      baseRev.current = mine.rev;
      latest.current = mine.values;
      lastSent.current = JSON.stringify(mine.values);
      setValues(mine.values);
      setState({ kind: "saved", at: mine.savedAt });
    })();
    return () => { alive = false; };
  }, [key]);

  const save = async (): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (stopped.current) return;
    if (inFlight.current) { again.current = true; return; }
    const body = JSON.stringify(latest.current);
    // typed back to what was last saved: nothing to send — no save, no check on record
    if (body === lastSent.current) { setState((s) => (s.kind === "dirty" ? { kind: "saved", at: s.at } : s)); return; }
    const sentAt = edits.current;
    setState((s) => ({ kind: "saving", at: s.at }));
    inFlight.current = true;
    const sending = saveResultDraftAction(schemeId, participantId, latest.current, baseRev.current).catch(() => ({ error: "failed" as const }));
    ownInFlight.set(key, sending);
    const r = await sending;
    if (ownInFlight.get(key) === sending) ownInFlight.delete(key);
    inFlight.current = false;
    if ("ok" in r) {
      baseRev.current = r.rev;
      lastSent.current = body;
      ownSaved.set(key, { rev: r.rev, values: JSON.parse(body) as Values, savedAt: r.savedAt });
      setBad(new Set(r.notNumbers.map((x) => `${x.key}|${x.field}`)));
      setState(edits.current === sentAt ? { kind: "saved", at: r.savedAt } : { kind: "dirty", at: r.savedAt });
      // typed while it was in flight and asked to save: once more, over the revision just saved
      if (again.current) { again.current = false; void save(); }
    } else if (r.error === "stale") {
      again.current = false;
      stopped.current = true;
      setState({ kind: "stale" });
    } else {
      setState({ kind: "error", error: r.error });
    }
  };
  const change = (name: string, v: string) => {
    const next = { ...latest.current, [name]: v };
    latest.current = next;
    setValues(next);
    edits.current++;
    setState((s) => ({ kind: s.kind === "stale" ? "stale" : "dirty", at: s.at }));
    if (stopped.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, AUTOSAVE_MS);
  };
  const unsaved = state.kind === "dirty" || state.kind === "saving";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  // leaving by a link inside the portal raises no «beforeunload»: what was typed and not yet sent is
  // saved as the form goes, never dropped with its timer (the security sweep, UL-2 — a value typed
  // within four seconds of «← Към участието» came back empty)
  const saveNow = useRef(save);
  useEffect(() => { saveNow.current = save; });
  useEffect(() => () => {
    const pending = timer.current !== null || JSON.stringify(latest.current) !== lastSent.current;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending && !stopped.current) void saveNow.current();
  }, []);
  /** Save now, waiting for any save in flight (6.4: the review submits exactly what was saved) —
   *  the revision saved, or null when the draft could not be saved (stale, an error). */
  const flush = async (): Promise<number | null> => {
    for (let i = 0; i < 100 && inFlight.current; i++) await new Promise((r) => setTimeout(r, 100));
    await save();
    for (let i = 0; i < 100 && inFlight.current; i++) await new Promise((r) => setTimeout(r, 100));
    if (stopped.current) return null;
    return JSON.stringify(latest.current) === lastSent.current && baseRev.current > 0 ? baseRev.current : null;
  };
  return { values, change, save, state, bad, flush };
}

/** The draft's state in words, both languages. */
export function saveStatus(state: SaveState, L: (bg: string, en: string) => string): string {
  const time = (iso?: string) => (iso ? new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : "");
  return state.kind === "saving" ? L("Записва се…", "Saving…")
    : state.kind === "saved" ? L(`Черновата е записана в ${time(state.at)}`, `Draft saved at ${time(state.at)}`)
    : state.kind === "dirty" ? L("Има незаписани промени", "Unsaved changes")
    : state.kind === "stale" ? L("Междувременно черновата е записана другаде (друг раздел или друг потребител). Нищо не е записано отгоре ѝ — презаредете страницата, за да продължите от нея.", "The draft was saved elsewhere meanwhile (another tab or another user). Nothing was written over it — reload the page to continue from it.")
    : state.kind === "error" ? (state.error === "state" ? L("Формулярът вече не приема промени.", "The form no longer takes changes.") : L("Черновата НЕ е записана — опитайте пак.", "The draft was NOT saved — try again."))
    : L("Още нищо не е записано.", "Nothing saved yet.");
}
