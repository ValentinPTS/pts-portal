"use client";

import Link from "next/link";
import { useLang } from "@/components/LangProvider";

// Consistent "back" control for sub-pages (Edit, Results, Account, …). The
// explorer pages use the breadcrumb instead; this is for the centered pages.
// `label` overrides the default translated "Back" (e.g. a scheme number).
export default function BackLink({ href, label }: { href: string; label?: string }) {
  const { t } = useLang();
  return (
    <Link
      href={href}
      className="no-underline"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
        color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 8,
        padding: "6px 11px", background: "#fff",
      }}
    >
      <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>←</span>
      {label ?? t("common.back")}
    </Link>
  );
}
