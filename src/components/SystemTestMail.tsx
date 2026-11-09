"use client";

import { useRef, useState } from "react";
import { sendTestMailAction } from "@/lib/actions";

// «Пробно писмо» (plan part 1.7): one e-mail to the signed-in person's own address,
// to see that the portal's mail arrives from ptsbg.eu, signed. Never to anyone else.
export default function SystemTestMail({ lang, enabled }: { lang: "bg" | "en"; enabled: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // a second click while sending is ignored

  const send = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMsg("");
    try {
      const r = await sendTestMailAction();
      if (r.ok) setMsg(L("Изпратено до вашия адрес. Проверете и папката за нежелана поща.", "Sent to your own address. Check the spam folder too."));
      else if (r.error === "no-login") setMsg(L("Само при включен вход — писмото отива до вашия адрес.", "Only with sign-in on — the e-mail goes to your own address."));
      else if (r.error === "not-configured") setMsg(L("Пощата на портала не е настроена (MAIL_PROVIDER, MAIL_API_KEY, MAIL_FROM).", "The portal's mail is not set up (MAIL_PROVIDER, MAIL_API_KEY, MAIL_FROM)."));
      else setMsg(L(`Не тръгна: ${r.detail ?? ""}`, `Not sent: ${r.detail ?? ""}`));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div data-test-mail className="flex items-center gap-2 flex-wrap">
      <button type="button" className="btn btn-sm" disabled={!enabled || busy} onClick={send} style={{ fontSize: 12, padding: "5px 10px" }}>
        {busy ? L("Изпраща се…", "Sending…") : L("Изпрати пробно писмо до мен", "Send a test e-mail to me")}
      </button>
      {msg && <span role="status" className="text-xs">{msg}</span>}
    </div>
  );
}
