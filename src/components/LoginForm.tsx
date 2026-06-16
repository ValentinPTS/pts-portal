"use client";

import { useActionState } from "react";
import { signInAction, verifyTotpAction, type AuthState } from "@/lib/auth-actions";

const input = "w-full rounded px-3 py-2 mt-1";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;

export default function LoginForm({ next, denied, audience = "owner" }: { next: string; denied?: boolean; audience?: "owner" | "lab" }) {
  const [signIn, signInFn] = useActionState<AuthState, FormData>(signInAction, {});
  const [totp, totpFn] = useActionState<AuthState, FormData>(verifyTotpAction, {});
  const showTotp = signIn.needsTotp || totp.needsTotp;
  const isLab = audience === "lab";

  return (
    <div className="card p-6 mx-auto mt-12" style={{ maxWidth: 420 }}>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>
        {showTotp ? "Two-factor code" : isLab ? "Laboratory sign in" : "Owner sign in"}
      </h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        {showTotp
          ? "Enter the 6-digit code from your authenticator app."
          : isLab
            ? "PTS Bulgaria — laboratory portal. See your results and download your documents."
            : "PTS Bulgaria — provider portal. Owners only."}
      </p>

      {denied && !showTotp && (
        <p className="text-sm mt-3" style={{ color: "var(--red)" }}>
          That account isn’t an authorized owner.
        </p>
      )}

      {showTotp ? (
        <form action={totpFn} className="mt-4">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm" style={{ color: "var(--muted)" }}>
            Authenticator code
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
          <button type="submit" className="btn btn-primary mt-4 w-full justify-center">Verify &amp; continue</button>
        </form>
      ) : (
        <form action={signInFn} className="mt-4">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm" style={{ color: "var(--muted)" }}>
            E-mail
            <input name="email" type="email" autoComplete="username" className={input} style={inputStyle} autoFocus />
          </label>
          <label className="block text-sm mt-3" style={{ color: "var(--muted)" }}>
            Password
            <input name="password" type="password" autoComplete="current-password" className={input} style={inputStyle} />
          </label>
          {signIn.error && <p className="text-sm mt-2" style={{ color: "var(--red)" }}>{signIn.error}</p>}
          <button type="submit" className="btn btn-primary mt-4 w-full justify-center">Sign in</button>
        </form>
      )}
    </div>
  );
}
