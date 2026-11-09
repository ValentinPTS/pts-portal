"use client";

import { useFormStatus } from "react-dom";

// A submit button that cannot be pressed twice while its form is being sent — a second
// click would add a second participant, with a second code (3.12 review).
export default function PendingSubmit({ label, className = "btn btn-primary" }: { label: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} aria-busy={pending}>{label}</button>;
}
