import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { AUTH_ENABLED } from "@/lib/auth";
import { DEV_ROLE_COOKIE, DEV_LAB_COOKIE, DEV_PARTICIPANT_COOKIE } from "@/lib/roles";
import { randomUUID } from "crypto";
import { openEntityUsers, linkEntityUserAccount, acceptEntityUserInvitation } from "@/lib/entity-users";
import { DEV_MODEL_COOKIE, parseModelPersona } from "@/lib/access";
import { getDb } from "@/lib/supabase";
import { isTestEnvironment } from "@/lib/environment";
import { getScheme } from "@/lib/store";
import { addLab, getLab, listLabs } from "@/lib/labs";
import { addParticipant, listParticipationsForLab } from "@/lib/participants";
import { isProvisional } from "@/lib/coding-model";
import { devCodeNow } from "@/lib/coding-store";

// Development only: switch the local persona (see devPersona in lib/roles.ts).
//   /dev/persona?role=staff|auditor|manager[&next=/path]
//   /dev/persona?role=lab[&lab=<lab id>][&join=<scheme id>][&next=/path]   (part 1.4)
//   /dev/persona?role=participant&user=<entity user id>[&next=/path]   (part 4.4: a
//     participant's user of a legal entity — in memory only; an invited one accepts its
//     invitation here, as setting a password would)
//   /dev/persona?model=quality | scheme_manager@<scheme id>[,…][&next=/path]  (part 2.4:
//     the role model's roles — permanent, or per scheme — so each role's view is checked)
//   anything else clears it.
// A laboratory persona acts as one ACTIVE laboratory, by id. With no database: the
// first active one, or a demo laboratory made for it; `join` adds that laboratory to
// a scheme as a participant, since applying online is closed in the transition (0.4)
// and staff-added participants carry no laboratory account. With a database (the
// test environment only — lib/roles refuses a lab persona on the real one) the id
// must be given: no silent pick of a named laboratory, and nothing is created.
// Answers 404 in a production build and whenever login is on, so it can never grant
// anything on the live portal; this route never writes to a database.
const DEMO_LAB = { email: "demo-lab@example.test", name: "Демо лаборатория (dev)" };

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development" || AUTH_ENABLED) return new NextResponse(null, { status: 404 });
  // a GET that changes who you are: only from this app's own pages (or typed in)
  if (req.headers.get("sec-fetch-site") === "cross-site") return new NextResponse(null, { status: 403 });
  const q = req.nextUrl.searchParams;
  const role = q.get("role") ?? "";
  const store = await cookies();
  const memoryOnly = !getDb(); // nothing is ever made in a real database from here
  const model = q.get("model");
  store.delete(DEV_MODEL_COOKIE);

  if (model) {
    const roles = parseModelPersona(model);
    if (!roles) return new NextResponse("Unknown role: use head, quality, software_admin, or scheme_manager@<scheme id> (and the other scheme roles), comma-separated.", { status: 400 });
    store.set(DEV_MODEL_COOKIE, encodeURIComponent(model), { path: "/", sameSite: "lax", httpOnly: true });
    // one of PTS's people for the earlier gates; the head manages people as a manager would (2.2)
    store.set(DEV_ROLE_COOKIE, roles.permanent.includes("head") ? "manager" : "staff", { path: "/", sameSite: "lax", httpOnly: true });
    store.delete(DEV_LAB_COOKIE);
    store.delete(DEV_PARTICIPANT_COOKIE);
  } else if (role === "participant") {
    if (!memoryOnly) return new NextResponse("A participant's user persona is offered in memory only.", { status: 409 });
    const id = q.get("user") ?? "";
    const [u] = id ? await openEntityUsers({ actor: "build", purpose: "write" }, { userId: id }) : [];
    if (!u || u.state === "inactive") return new NextResponse("Pass ?user=<id> of a participant's user that is not inactive.", { status: 409 });
    if (u.state === "invited") {
      // the invitation accepted, as at its password: a sign-in account of its own (memory)
      if (!u.authUserId) await linkEntityUserAccount(u.id, randomUUID(), "build");
      const [linked] = await openEntityUsers({ actor: "build", purpose: "write" }, { userId: u.id });
      if (linked?.authUserId) await acceptEntityUserInvitation(linked.authUserId, "build");
    }
    store.set(DEV_ROLE_COOKIE, "lab", { path: "/", sameSite: "lax", httpOnly: true });
    store.delete(DEV_LAB_COOKIE);
    store.set(DEV_PARTICIPANT_COOKIE, u.id, { path: "/", sameSite: "lax", httpOnly: true });
  } else if (role === "manager" || role === "staff" || role === "auditor") {
    store.set(DEV_ROLE_COOKIE, role, { path: "/", sameSite: "lax", httpOnly: true });
    store.delete(DEV_LAB_COOKIE);
    store.delete(DEV_PARTICIPANT_COOKIE);
  } else if (role === "lab") {
    if (!memoryOnly && !isTestEnvironment()) return new NextResponse("A laboratory persona is not offered on the real database.", { status: 409 });
    const asked = q.get("lab");
    let lab = asked ? await getLab(asked) : null;
    if (lab && lab.status !== "active") lab = null; // an inactive one would only bounce to the sign-in
    if (!lab && !asked && memoryOnly) {
      lab = (await listLabs()).find((l) => l.status === "active") ?? (await addLab(DEMO_LAB));
    }
    if (!lab) return new NextResponse(asked ? "That laboratory is unknown or not active." : "Pass ?lab=<id> of an active laboratory.", { status: 409 });
    const join = q.get("join");
    if (join && memoryOnly && (await getScheme(join)) && !(await listParticipationsForLab(lab.id, { actor: "build", purpose: "lab.own" })).some((p) => p.schemeId === join)) {
      const joined = await addParticipant({ schemeId: join, labName: lab.name, email: lab.email, labId: lab.id }, "build");
      // dev only: the persona works as a laboratory at once, so its participation is coded
      // at once, on record as a dev coding — the act itself (5.3) is checked by verify-coding
      if (isProvisional(joined.code)) await devCodeNow(join, [joined.id]);
    }
    store.set(DEV_ROLE_COOKIE, "lab", { path: "/", sameSite: "lax", httpOnly: true });
    store.set(DEV_LAB_COOKIE, lab.id, { path: "/", sameSite: "lax", httpOnly: true });
    store.delete(DEV_PARTICIPANT_COOKIE);
  } else {
    store.delete(DEV_ROLE_COOKIE);
    store.delete(DEV_LAB_COOKIE);
    store.delete(DEV_PARTICIPANT_COOKIE);
  }
  // only ever back into this app: "/\\host" and similar resolve off-site, so the
  // resolved origin is compared rather than the string's first characters
  const home = role === "lab" ? "/lab" : role === "participant" ? "/lab/confirm" : "/";
  let to = new URL(home, req.url);
  try {
    const u = new URL(q.get("next") ?? home, req.url);
    if (u.origin === to.origin) to = u;
  } catch { /* malformed → home */ }
  return NextResponse.redirect(to);
}
