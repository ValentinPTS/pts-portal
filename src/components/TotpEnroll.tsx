"use client";

import { useActionState, useState } from "react";
import { startTotpEnrollAction, verifyTotpEnrollAction, type AuthState } from "@/lib/auth-actions";
import { useLang } from "@/components/LangProvider";

type Enroll = { factorId?: string; qr?: string; secret?: string; error?: string };

export default function TotpEnroll() {
  const { t } = useLang();
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [busy, setBusy] = useState(false);
  const [verify, verifyFn] = useActionState<AuthState, FormData>(verifyTotpEnrollAction, {});

  async function begin() {
    setBusy(true);
    setEnroll(await startTotpEnrollAction());
    setBusy(false);
  }

  if (!enroll) {
    return (
      <button className="btn btn-primary mt-3" onClick={begin} disabled={busy}>
        {busy ? t("totp.preparing") : t("totp.setup")}
      </button>
    );
  }

  if (enroll.error) {
    return <p className="text-sm mt-3" style={{ color: "var(--red)" }}>{enroll.error}</p>;
  }

  const qr = enroll.qr ?? "";
  return (
    <div className="card p-4 mt-3" style={{ maxWidth: 460 }}>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {t("totp.step1")}
      </p>
      <div className="my-3 flex justify-center" style={{ background: "#fff", padding: 8, borderRadius: 8 }}>
        {qr.startsWith("data:") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Authenticator QR code" width={180} height={180} />
        ) : (
          <div style={{ width: 180, height: 180 }} dangerouslySetInnerHTML={{ __html: qr }} />
        )}
      </div>
      {enroll.secret && (
        <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
          {t("totp.manualKey")} <span className="font-mono" style={{ color: "var(--ink)" }}>{enroll.secret}</span>
        </p>
      )}
      <form action={verifyFn} className="mt-3">
        <input type="hidden" name="factorId" value={enroll.factorId ?? ""} />
        <label className="block text-sm" style={{ color: "var(--muted)" }}>
          {t("totp.step2")}
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="w-full rounded px-3 py-2 mt-1"
            style={{ border: "1px solid var(--line)", background: "#fff" }}
          />
        </label>
        {verify.error && <p className="text-sm mt-2" style={{ color: "var(--red)" }}>{verify.error}</p>}
        <button type="submit" className="btn btn-primary mt-3">{t("totp.confirm")}</button>
      </form>
    </div>
  );
}
