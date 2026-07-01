"use client";

import { useActionState } from "react";
import { signInAction, verifyTotpAction, type AuthState } from "@/lib/auth-actions";
import { useLang } from "@/components/LangProvider";

const input = "w-full rounded px-3 py-2 mt-1";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;

// A prominent secondary action (outlined green "button"-styled link) + a clear
// muted secondary link — used for the cross-door links under the sign-in form.
const outlinedBtn = {
  display: "block", textAlign: "center", padding: "11px 14px", borderRadius: 8,
  border: "2px solid var(--green-dark)", color: "var(--green-dark)", fontWeight: 700,
  fontSize: 14, textDecoration: "none", background: "#fff",
} as const;
const mutedLink = { color: "var(--muted)", fontSize: 13.5, fontWeight: 700, textDecoration: "underline" } as const;

export default function LoginForm({ next, denied, audience = "owner" }: { next: string; denied?: boolean; audience?: "owner" | "lab" }) {
  const { t, lang } = useLang();
  const [signIn, signInFn] = useActionState<AuthState, FormData>(signInAction, {});
  const [totp, totpFn] = useActionState<AuthState, FormData>(verifyTotpAction, {});
  const showTotp = signIn.needsTotp || totp.needsTotp;
  const isLab = audience === "lab";

  return (
    <div className="card p-6 mx-auto mt-12" style={{ maxWidth: 420 }}>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>
        {showTotp ? t("login.totpTitle") : isLab ? t("login.labTitle") : t("login.ownerTitle")}
      </h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        {showTotp ? t("login.totpSub") : isLab ? t("login.labSub") : t("login.ownerSub")}
      </p>

      {denied && !showTotp && (
        <p className="text-sm mt-3" style={{ color: "var(--red)" }}>
          {t("login.denied")}
        </p>
      )}

      {showTotp ? (
        <form action={totpFn} className="mt-4">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm" style={{ color: "var(--muted)" }}>
            {t("login.codeLabel")}
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className={input}
              style={inputStyle}
              autoFocus
            />
          </label>
          {totp.error && <p className="text-sm mt-2" style={{ color: "var(--red)" }}>{totp.error}</p>}
          <button type="submit" className="btn btn-primary mt-4 w-full justify-center">{t("login.verify")}</button>
        </form>
      ) : (
        <form action={signInFn} className="mt-4">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm" style={{ color: "var(--muted)" }}>
            {t("login.email")}
            <input name="email" type="email" autoComplete="username" className={input} style={inputStyle} autoFocus />
          </label>
          <label className="block text-sm mt-3" style={{ color: "var(--muted)" }}>
            {t("login.password")}
            <input name="password" type="password" autoComplete="current-password" className={input} style={inputStyle} />
          </label>
          {signIn.error && <p className="text-sm mt-2" style={{ color: "var(--red)" }}>{signIn.error}</p>}
          <button type="submit" className="btn btn-primary mt-4 w-full justify-center">{t("login.signIn")}</button>
        </form>
      )}

      {/* Cross-links (the "two clear doors" over one smart engine). Whichever door a
          person lands on, the sign-in itself resolves their role and routes them —
          these just help a human reach the right starting point. */}
      {!showTotp && (
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
          {isLab ? (
            <>
              <p className="text-sm text-center" style={{ color: "var(--muted)", marginBottom: 8 }}>
                {lang === "bg" ? "Нямате акаунт?" : "No account yet?"}
              </p>
              <a href="/register" style={outlinedBtn}>
                {lang === "bg" ? "Кандидатствайте тук" : "Apply for a lab account"}
              </a>
              <p className="text-center" style={{ marginTop: 12 }}>
                <a href="/login" style={mutedLink}>
                  {lang === "bg" ? "Вход за екипа на PTS" : "PTS team sign-in"}
                </a>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-center" style={{ color: "var(--muted)", marginBottom: 8 }}>
                {lang === "bg" ? "Лаборатория?" : "Are you a laboratory?"}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <a href="/lab/login" style={{ ...outlinedBtn, flex: 1, marginTop: 0 }}>
                  {lang === "bg" ? "Вход за лаборатории" : "Laboratory sign-in"}
                </a>
                <a href="/register" style={{ ...outlinedBtn, flex: 1, marginTop: 0 }}>
                  {lang === "bg" ? "Кандидатстване" : "Apply"}
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
