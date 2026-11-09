"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type PasswordState } from "@/lib/auth-actions";
import { useLang } from "@/components/LangProvider";

// «Forgot password» (part 1.5): one answer whatever the address, so the form never
// tells whether an account exists.
export default function ForgotPasswordForm({ back }: { back: string }) {
  const { lang } = useLang();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const [state, act, pending] = useActionState<PasswordState, FormData>(requestPasswordResetAction, {});
  if (state.sent) {
    return (
      <div role="status" data-reset-sent className="text-sm mt-4">
        {L("Ако има акаунт с този имейл, изпратихме му връзка за нова парола. Проверете пощата си, включително папката за нежелана поща.",
           "If an account has this e-mail, a link for a new password is on its way. Check your mail, the spam folder too.")}
        <div className="mt-3"><a href={back} style={{ textDecoration: "underline" }}>{L("Обратно към входа", "Back to sign-in")}</a></div>
      </div>
    );
  }
  return (
    <form action={act} className="mt-4">
      {/* a field people never see — a bot fills it, and is answered as if all went well */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: -9999, width: 1, height: 1 }} />
      <label className="block text-sm" style={{ color: "var(--muted)" }}>
        {L("Имейл", "E-mail")}
        <input name="email" type="email" required autoComplete="username" className="w-full rounded px-3 py-2 mt-1" style={{ border: "1px solid var(--line)", background: "#fff" }} />
      </label>
      {state.message && <p role="alert" className="text-sm mt-2" style={{ color: "var(--red)" }}>{state.message}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary mt-4 w-full justify-center">{L("Изпрати връзка", "Send a link")}</button>
    </form>
  );
}
