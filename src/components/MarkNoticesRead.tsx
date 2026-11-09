"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsReadAction } from "@/lib/actions";

// «Прочетени» — for THIS person only (plan part 4.6, N28): the others still see them unread.
export default function MarkNoticesRead({ lang, ids }: { lang: "bg" | "en"; ids: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-sm" data-mark-read disabled={pending}
      onClick={() => start(async () => { await markNotificationsReadAction(ids); router.refresh(); })}>
      {lang === "bg" ? "Отбележи като прочетени (за мен)" : "Mark as read (for me)"}
    </button>
  );
}
