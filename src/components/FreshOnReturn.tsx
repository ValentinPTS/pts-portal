"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// A page shown again from the browser's history (Back, Forward) is the copy as it was rendered — a results
// form open before the deadline came back open after it (round 7, R7UL-4). The age is measured on the
// browser's OWN clock — when this render was first shown here — never against the server's time: a lab
// PC whose clock ran fast refreshed forever (round 7 review, RV7-1). A refreshed render is a new one (a new
// `renderedAt`), first seen now — it cannot loop. A page restored whole from the browser's back-forward
// cache runs no effect: `pageshow` with `persisted` asks again too.
const firstSeen = new Map<string, number>();
export default function FreshOnReturn({ renderedAt, maxAgeMs = 30_000 }: { renderedAt: string; maxAgeMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const now = Date.now();
    const seen = firstSeen.get(renderedAt);
    if (seen === undefined) { firstSeen.set(renderedAt, now); if (firstSeen.size > 50) firstSeen.delete(firstSeen.keys().next().value as string); return; }
    if (now - seen > maxAgeMs) router.refresh();
  }, [renderedAt, maxAgeMs, router]);
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) router.refresh(); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [router]);
  return null;
}
