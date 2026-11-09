"use client";

import { useActionState } from "react";
import { setPasswordAction, changePasswordAction, type PasswordState } from "@/lib/auth-actions";
import { useLang } from "@/components/LangProvider";

// Set a password (after an invitation, a reset link or a temporary password) or
// change one's own (part 1.5). The password goes straight to Supabase; the portal
// never keeps it.
export default function PasswordForm({ mode, from = "" }: { mode: "set" | "change"; from?: string }) {
  const { lang } = useLang();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const [state, act, pending] = useActionState<PasswordState, FormData>(mode === "set" ? setPasswordAction : changePasswordAction, {});
  const input = "w-full rounded px-3 py-2 mt-1";
  const style = { border: "1px solid var(--line)", background: "#fff" } as const;
  return (
    <form action={act} className="mt-3" data-password-form={mode}>
      <input type="hidden" name="from" value={from} />
      {mode === "change" && (
        // a session left open is not enough to take the account: the current one first
        <label className="block text-sm mb-3" style={{ color: "var(--muted)" }}>
          {L("Текуща парола", "Current password")}
          <input name="current" type="password" autoComplete="current-password" required maxLength={200} className={input} style={style} />
        </label>
      )}
      <label className="block text-sm" style={{ color: "var(--muted)" }}>
        {L("Нова парола (поне 10 знака)", "New password (at least 10 characters)")}
        <input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={200} required className={input} style={style} />
      </label>
      <label className="block text-sm mt-3" style={{ color: "var(--muted)" }}>
        {L("Същата още веднъж", "The same again")}
        <input name="repeat" type="password" autoComplete="new-password" minLength={10} maxLength={200} required className={input} style={style} />
      </label>
      {state.message && (
        <p role={state.error ? "alert" : "status"} className="text-sm mt-2" style={{ color: state.error ? "var(--red)" : "var(--green-dark)" }}>{state.message}</p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary mt-4">
        {mode === "set" ? L("Запази паролата", "Save the password") : L("Смени паролата", "Change the password")}
      </button>
    </form>
  );
}
