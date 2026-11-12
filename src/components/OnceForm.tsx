"use client";

import { useRef, type FormEvent, type ReactNode } from "react";

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
  return (
    <form
      {...rest}
      action={action}
      onSubmit={(e) => {
        onSubmit?.(e);
        if (e.defaultPrevented) return;
        if (Date.now() - sent.current < 30_000) { e.preventDefault(); return; }
        sent.current = Date.now();
      }}
    >
      {children}
    </form>
  );
}
