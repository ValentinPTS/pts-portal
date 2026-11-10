"use client";

import { useFormStatus } from "react-dom";

// A submit button that cannot be pressed twice while its form is being sent — a second
// click would add a second participant, with a second code (3.12 review).
export default function PendingSubmit({ label, className = "btn btn-primary", mark }: { label: string; className?: string; /** a data-* attribute the browser checks find it by */ mark?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} aria-busy={pending} {...(mark && /^data-[a-z-]+$/.test(mark) ? { [mark]: "" } : {})}>{label}</button>;
}
