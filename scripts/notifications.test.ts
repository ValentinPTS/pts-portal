// The notification outbox: recording and delivery are separate concerns, and the
// in-memory fallback must behave like the DB path (no Supabase configured here).
import { notify, listForProvider, listForLab, withReadState, markRead, readerKey, listUndelivered, markDelivered, listHeld, decideNotice, isDeliverable, isOut, BACKFILL_RELEASE } from "../src/lib/notifications.ts";
// unread for a reader (4.6, N28: each person's read — no longer one for everyone)
const unread = async (list: Awaited<ReturnType<typeof listForLab>>, reader: string) => (await withReadState(list, reader)).filter((n) => !n.readAt).length;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const a = await notify({ kind: "application.received", audience: "provider", schemeId: "S1", code: "261101", bg: "Нова заявка", en: "New application" });
const b = await notify({ kind: "application.approved", audience: "lab", labId: "LAB-1", schemeId: "S1", code: "261101", bg: "Одобрена", en: "Approved" });
const c = await notify({ kind: "results.due", audience: "lab", labId: "LAB-2", schemeId: "S1", bg: "Утре", en: "Tomorrow" });

// Реш. 138 (part 0.8): a notice to a laboratory is held until a person releases it
t("a lab notice starts held", !b!.releasedAt && !b!.withheldAt);
t("held: not in the lab's feed", (await listForLab("LAB-1")).length === 0 && (await listForLab("LAB-2")).length === 0);
t("held: not handed to a transport", (await listUndelivered()).length === 1 && (await listUndelivered())[0].audience === "provider");
t("held: on the list waiting for a person", (await listHeld()).length === 2);
t("held: a lab has nothing unread", (await unread(await listForLab("LAB-1"), readerKey.labAccount("acc-1"))) === 0);
t("release one", await decideNotice(b!.id, "release", "ana@ptsbg.eu"));
t("release again does nothing", !(await decideNotice(b!.id, "release", "ana@ptsbg.eu")));
t("a provider notice cannot be 'released'", !(await decideNotice(a!.id, "release", "ana@ptsbg.eu")));
t("release the other", await decideNotice(c!.id, "release", "ana@ptsbg.eu"));
t("nothing is waiting any more", (await listHeld()).length === 0);

t("notify returns the row it recorded", !!a && !!b && a!.id !== b!.id);
t("both languages are fixed at write time", a!.bg === "Нова заявка" && a!.en === "New application");
t("a new notice is undelivered and unread", !a!.emailedAt && !a!.readAt);

const prov = await listForProvider();
t("provider feed has only provider notices", prov.length === 1 && prov[0].audience === "provider");

const lab1 = await listForLab("LAB-1");
const lab2 = await listForLab("LAB-2");
t("a lab sees only its own", lab1.length === 1 && lab1[0].labId === "LAB-1");
t("labs are isolated from each other", lab2.length === 1 && lab2[0].labId === "LAB-2");
t("no lab sees the provider's feed", !lab1.some((n) => n.audience === "provider"));

t("unread counts per audience", (await unread(await listForProvider(), readerKey.staff("ana@ptsbg.eu"))) === 1 && (await unread(await listForLab("LAB-1"), readerKey.labAccount("acc-1"))) === 1);
await markRead(readerKey.labAccount("acc-1"), (await listForLab("LAB-1")).map((n) => n.id));
t("one person reading a lab's feed leaves the others alone — another person of it, other labs, PTS (N28)",
  (await unread(await listForLab("LAB-1"), readerKey.labAccount("acc-1"))) === 0 && (await unread(await listForLab("LAB-1"), readerKey.labAccount("acc-9"))) === 1
  && (await unread(await listForLab("LAB-2"), readerKey.labAccount("acc-2"))) === 1 && (await unread(await listForProvider(), readerKey.staff("ana@ptsbg.eu"))) === 1);

// delivery is independent of read state — a notice read in-app is still unsent
const undel = await listUndelivered();
t("everything is still awaiting delivery", undel.length === 3, String(undel.length));
t("undelivered comes oldest-first (a transport sends in order)",
  (undel[0].createdAt || "") <= (undel[1].createdAt || ""));
await markDelivered(undel[0].id);
t("delivering one removes only it from the queue", (await listUndelivered()).length === 2);
t("delivery does not change read state", (await unread(await listForProvider(), readerKey.staff("ana@ptsbg.eu"))) === 1);

// §4.2 — the record carries a code, never a name
t("a notice identifies a lab by code only", a!.code === "261101" && !JSON.stringify(a).includes("Laborator"));

// a withheld notice is never shown and never sent, but stays on record
const w = await notify({ kind: "docs.sent", audience: "lab", labId: "LAB-1", schemeId: "S1", code: "261101", bg: "Документ", en: "Document" });
t("withhold it", await decideNotice(w!.id, "withhold", "ana@ptsbg.eu"));
t("withheld: not in the feed", !(await listForLab("LAB-1")).some((n) => n.id === w!.id));
t("withheld: not to the transport", !(await listUndelivered()).some((n) => n.id === w!.id));
t("withheld: cannot be released afterwards", !(await decideNotice(w!.id, "release", "ana@ptsbg.eu")));

// the backlog migration 0016 released for the portal is never e-mailed (no one saw it)
const old0 = { id: "o", kind: "docs.sent", audience: "lab", labId: "LAB-1", bg: "", en: "", createdAt: "2026-10-01T00:00:00Z", releasedAt: "2026-10-01T00:00:00Z", releasedBy: BACKFILL_RELEASE } as const;
t("backfilled: shown in the portal", isOut(old0 as never));
t("backfilled: never e-mailed", !isDeliverable(old0 as never));
t("released by a person: e-mailed", isDeliverable({ ...old0, releasedBy: "ana@ptsbg.eu" } as never));

console.log(`notifications.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
