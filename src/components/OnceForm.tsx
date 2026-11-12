"use client";

import { useCallback, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

// The form's action finished (its answer came, whatever address it came on — round 7, Q4: the same
// «?err=» twice held a corrected file for half a minute): sending is allowed again.
function ReleaseWhenDone({ onDone }: { onDone: () => void }) {
  const { pending } = useFormStatus();
  const was = useRef(false);
  useEffect(() => { if (was.current && !pending) onDone(); was.current = pending; }, [pending, onDone]);
  return null;
}

// A form sent ONCE: a second submit while the first is on its way is ignored (round 5, R5UA-5 — a
// double click on «Внеси» recorded the same report twice, «Запиши» the same transfer check). The
// action's own redirect reloads the page; if it does not come within half a minute, sending is allowed
// again (a connection that failed must not leave the form dead).
export default function OnceForm({ action, children, onSubmit, ...rest }: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit">) {
  const sent = useRef(0);
  // the page answered (a refusal brings it back, re-rendered): sending is allowed again at once — a corrected
  // file was held for half a minute otherwise (round 6, R6S-10)
  // — known by the address it came back on («?err=…», «?ok=…»), never by a mere re-render mid-flight
  const sentAt = useRef("");
  useEffect(() => { if (sent.current && window.location.href !== sentAt.current) sent.current = 0; });
  const release = useCallback(() => { sent.current = 0; }, []);
  return (
    <form
      {...rest}
      action={action}
      onSubmit={(e) => {
        onSubmit?.(e);
        if (e.defaultPrevented) return;
        if (Date.now() - sent.current < 30_000) { e.preventDefault(); return; }
        sent.current = Date.now();
        sentAt.current = window.location.href;
      }}
    >
      {children}
      <ReleaseWhenDone onDone={release} />
    </form>
  );
}
