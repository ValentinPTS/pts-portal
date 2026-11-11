// Account e-mail links and passwords (plan part 1.5, finding P4.b): the pure rules,
// and the wiring that makes an invited or resetting person able to set a password.
import { readFileSync } from "node:fs";
import { isOtpType, afterLinkDest, safeNext, safeDest, passwordProblem, inviteLink, RESET_RETURN, INVITE_RETURN, OTP_TYPES, siteOrigin, authErrorText } from "../src/lib/auth-links.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

// ── link kinds ────────────────────────────────────────────────────────────
for (const k of ["invite", "recovery", "email", "email_change"]) t(`a «${k}» link is accepted`, isOtpType(k));
// sign-ups are off and magic links unused (review of 1.5)
for (const k of ["", "INVITE", "admin", "sms", "signup", "magiclink", null, undefined, 1]) t(`«${String(k)}» is not a link kind`, !isOtpType(k));
t("an invitation leads to setting a password", afterLinkDest("invite") === "/auth/set-password?from=invite");
t("a reset leads to setting a password", afterLinkDest("recovery") === "/auth/set-password?from=recovery");
t("a confirmation leads to «confirmed»", afterLinkDest("email") === "/auth/confirmed" && afterLinkDest("email_change") === "/auth/confirmed");
t("every kind has a landing", OTP_TYPES.every((k) => afterLinkDest(k).startsWith("/auth/")));

// ── where a link may send a person ────────────────────────────────────────
t("a path in the app", safeNext("/lab", "/x") === "/lab");
t("with a query", safeNext("/auth/set-password?from=invite", "/x") === "/auth/set-password?from=invite");
t("what is followed is what was checked: «/a/../lab» → /lab", safeNext("/a/../lab", "/x") === "/lab");
t("an encoded «//» stays a path here", safeNext("/%2F%2Fevil.example", "/x") === "/%2F%2Fevil.example");
for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "evil", "", null, "/auth/confirm?x=1", "/ok\r\nSet-Cookie: x",
                   // a tab or another control character the URL parser drops — «/\t/evil» becomes //evil (review of 1.5)
                   "/\t/evil.example", "/\n/evil.example", "/\u0000/evil.example", "/\u007f/x", "/%2F%2Fevil.example/../../auth/confirm"]) {
  t(`«${String(bad)}» falls back`, safeNext(bad as string, "/fallback") === "/fallback");
}

// ── passwords ─────────────────────────────────────────────────────────────
t("ten characters, typed twice", passwordProblem("correct horse", "correct horse") === null);
t("too short", passwordProblem("short", "short") === "short");
t("too long", passwordProblem("x".repeat(201), "x".repeat(201)) === "long");
t("typed differently", passwordProblem("correct horse", "correct hors3") === "mismatch");
t("not the e-mail address", passwordProblem("lab@example.bg", "lab@example.bg", "Lab@Example.bg") === "is-email");

// ── the invitation link ───────────────────────────────────────────────────
const link = inviteLink("https://portal.ptsbg.eu/", "abc+/=123");
const u = new URL(link);
t("an invitation goes to /auth/confirm", u.origin === "https://portal.ptsbg.eu" && u.pathname === "/auth/confirm");
t("…with the token, encoded", u.searchParams.get("token_hash") === "abc+/=123" && u.searchParams.get("type") === "invite");
t("…and on to setting a password", u.searchParams.get("next") === "/auth/set-password?from=invite");
t("…and never a password in it", !/password=/.test(link));
t("a reset returns through /auth/confirm to setting a password", new URL(RESET_RETURN, "https://x").searchParams.get("next") === "/auth/set-password?from=recovery");
t("an invitation Supabase sends returns to «set a password» as an invitation", new URL(INVITE_RETURN, "https://x").searchParams.get("next") === "/auth/set-password?from=invite");

// ── one fixed address for e-mail links ────────────────────────────────────
t("the configured address wins over the request's Host", siteOrigin("evil.example", "https", { NEXT_PUBLIC_SITE_URL: "https://portal.ptsbg.eu/" }) === "https://portal.ptsbg.eu");
t("no configured address → the request's (local development)", siteOrigin("localhost:3000", "http", {}) === "http://localhost:3000");
t("a junk configured address is ignored", siteOrigin("localhost:3000", "http", { NEXT_PUBLIC_SITE_URL: "javascript:x" }) === "http://localhost:3000");
t("no address at all → none", siteOrigin("", "https", {}) === "");

// ── Supabase errors in plain words ────────────────────────────────────────
for (const code of ["same_password", "weak_password", "insufficient_aal", "otp_expired", "invalid_credentials", "over_email_send_rate_limit"]) {
  t(`«${code}» in BG and EN`, / · /.test(authErrorText(code)) && !/^[a-z_]+$/.test(authErrorText(code)));
}
t("an unknown code: the plain fallback, never the raw message", authErrorText("something_new").includes("опитайте пак"));

// ── wired ─────────────────────────────────────────────────────────────────
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const proxy = src("proxy.ts");
t("the proxy lets /auth through, before any session refresh", /if \(authPath === "\/auth" \|\| authPath\.startsWith\("\/auth\/"\)\) return response;/.test(proxy)
  && proxy.indexOf('authPath.startsWith("/auth/")') < proxy.indexOf("supabase.auth.getUser()"));
// opening a link spends nothing: /auth/confirm is a page with a button, the token goes in a POST
const confirmPage = src("app/auth/confirm/page.tsx");
t("opening a link spends nothing: a page, its form posts to an action", /<form action=\{acceptLinkAction\}/.test(confirmPage) && !/verifyOtp/.test(confirmPage));
const actions = src("lib/actions.ts");
t("a manager's temporary password must be changed first — in app_metadata, out of the holder's reach", /app_metadata: \{ must_change_password: true \}/.test(actions) && !/user_metadata: \{ must_change_password/.test(actions));
t("invitations: the portal's mailer when it has one, the link not a password", /generateLink\(\{ type: "invite", email \}\)/.test(actions) && /inviteLink\(origin, data\.properties\.hashed_token\)/.test(actions));
const roles = src("lib/roles.ts");
// requireManager, requireStaff, requireWriter and (part 2.2) requirePeopleManager
t("every staff guard sends a must-change session to set its password", (roles.match(/if \(ctx\.mustChangePassword\) redirect\("\/auth\/set-password\?must=1"\)/g) ?? []).length === 4 && (roles.match(/export async function require\w+\(\): Promise<void> \{\s*if \(!AUTH_ENABLED\)/g) ?? []).length === 4);
const labAuth = src("lib/lab-auth.ts");
t("the lab guard too", /mustChangePassword\) redirect\("\/auth\/set-password\?must=1"\)/.test(labAuth));
t("…and every lab route and action through the session: no lab session before the password is changed or 2FA passed", /if \(session\.mustChangePassword \|\| session\.needsAal2\) return null;/.test(labAuth));
const authActions = src("lib/auth-actions.ts");
t("sign-in routes a must-change account to set its password", /app_metadata\?\.must_change_password === true \? "\/auth\/set-password\?must=1"/.test(authActions));
t("the flag is cleared by the server, not by the holder", /updateUserById\(userId, \{ app_metadata: \{ must_change_password: false \} \}\)/.test(authActions));
t("changing a password needs the current one", /currentPasswordIsRight\(session\.email, String\(formData\.get\("current"\)/.test(authActions)
  && /signOut\(\{ scope: "local" \}\)/.test(authActions));
t("an account with an authenticator passes its code before a new password", (authActions.match(/if \(session\.needsAal2\) return \{ error: "totp"/g) ?? []).length === 2);
t("«forgot password» sends after the response — the timing tells nothing", /after\(async \(\) => \{[\s\S]{0,900}resetPasswordForEmail/.test(authActions));
t("the journal never carries the address for these", !/logActivity\("auth\.[a-z_]+", \{[^}]*email/.test(authActions));
t("«forgot password» answers the same whatever the address", /const done: PasswordState = \{ sent: true \};/.test(authActions) && /return done;\n\}/.test(authActions));

// ── the security sweep (SA-2, SI-4): nothing a browser reads as another site ─────────────
for (const n of ["/\\evil.example", "/\\evil.example/x", "/\t/evil.example", "/.//evil.example", "/x/..//evil.example", "/%2e//evil.example", "//evil.example", "https://evil.example", "/\n/evil.example"]) {
  t(`safeNext refuses ${JSON.stringify(n)}`, safeNext(n, "/x") === "/x", safeNext(n, "/x"));
  t(`safeDest (staff) refuses ${JSON.stringify(n)}`, safeDest("internal", n) === "/", safeDest("internal", n));
  t(`safeDest (lab) refuses ${JSON.stringify(n)}`, safeDest("lab", n) === "/lab", safeDest("lab", n));
}
t("safeDest: a staff page is followed", safeDest("internal", "/schemes/26-11-T-1?tab=x") === "/schemes/26-11-T-1?tab=x");
t("safeDest: staff never to the lab side or the sign-in", safeDest("internal", "/lab/p/1") === "/" && safeDest("internal", "/login?next=/") === "/");
t("safeDest: a lab to its own side", safeDest("lab", "/lab/p/1") === "/lab/p/1" && safeDest("lab", "/lab") === "/lab");
t("safeDest: a lab never elsewhere, never «/labx», never its sign-in", safeDest("lab", "/schemes") === "/lab" && safeDest("lab", "/labx") === "/lab" && safeDest("lab", "/lab/login") === "/lab");
t("the sign-in page passes «next» through safeNext", /const next = safeNext\(sp\.next, "\/"\)/.test(readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8")));
t("the sign-in's actions use safeDest from auth-links (never a sync export of a «use server» file)", /safeDest, safeNext/.test(authActions) && !/export function safeDest/.test(authActions));

console.log(`auth-links.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
