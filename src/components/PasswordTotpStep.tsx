"use client";

import { useActionState } from "react";
import { verifyTotpForPasswordAction, type PasswordState } from "@/lib/auth-actions";
import { useLang } from "@/components/LangProvider";

// An account with an authenticator passes its code before a new password is set
// (part 1.5) — after a reset link the session is not yet at that level.
export default function PasswordTotpStep({ from }: { from: string }) {
  const { lang } = useLang();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const [state, act, pending] = useActionState<PasswordState, FormData>(verifyTotpForPasswordAction, {});
  return (
    <form action={act} className="mt-3" data-password-totp>
      <input type="hidden" name="from" value={from} />
      <label className="block text-sm" style={{ color: "var(--muted)" }}>
        {L("Код от приложението за удостоверяване", "Code from your authenticator app")}
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required className="w-full rounded px-3 py-2 mt-1" style={{ border: "1px solid var(--line)", background: "#fff" }} />
      </label>
      {state.message && <p role="alert" className="text-sm mt-2" style={{ color: "var(--red)" }}>{state.message}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary mt-4">{L("Продължи", "Continue")}</button>
    </form>
  );
}
