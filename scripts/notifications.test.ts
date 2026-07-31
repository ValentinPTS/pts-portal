// The notification outbox: recording and delivery are separate concerns, and the
// in-memory fallback must behave like the DB path (no Supabase configured here).
import { notify, listForProvider, listForLab, unreadCount, markAllRead, listUndelivered, markDelivered } from "../src/lib/notifications.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const a = await notify({ kind: "application.received", audience: "provider", schemeId: "S1", code: "261101", bg: "Нова заявка", en: "New application" });
const b = await notify({ kind: "application.approved", audience: "lab", labId: "LAB-1", schemeId: "S1", code: "261101", bg: "Одобрена", en: "Approved" });
await notify({ kind: "results.due", audience: "lab", labId: "LAB-2", schemeId: "S1", bg: "Утре", en: "Tomorrow" });

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

t("unread counts per audience", (await unreadCount("provider")) === 1 && (await unreadCount("lab", "LAB-1")) === 1);
await markAllRead("lab", "LAB-1");
t("marking one lab read leaves the others alone",
  (await unreadCount("lab", "LAB-1")) === 0 && (await unreadCount("lab", "LAB-2")) === 1 && (await unreadCount("provider")) === 1);

// delivery is independent of read state — a notice read in-app is still unsent
const undel = await listUndelivered();
t("everything is still awaiting delivery", undel.length === 3, String(undel.length));
t("undelivered comes oldest-first (a transport sends in order)",
  (undel[0].createdAt || "") <= (undel[1].createdAt || ""));
await markDelivered(undel[0].id);
t("delivering one removes only it from the queue", (await listUndelivered()).length === 2);
t("delivery does not change read state", (await unreadCount("provider")) === 1);

// §4.2 — the record carries a code, never a name
t("a notice identifies a lab by code only", a!.code === "261101" && !JSON.stringify(a).includes("Laborator"));

console.log(`notifications.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
