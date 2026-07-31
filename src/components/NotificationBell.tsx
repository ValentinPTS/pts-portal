"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useLang } from "@/components/LangProvider";
import { markNotificationsReadAction } from "@/lib/actions";
import type { Notification } from "@/lib/types";

// The bell, its feed, and the toasts — one component, because they are three
// views of the same list and splitting them would mean fetching it twice.
//
// The list arrives ALREADY SCOPED from the server (the provider's feed, or one
// laboratory's). This component never asks for notifications and never filters
// by audience: nothing it could get wrong can widen what a reader sees.
//
// Toasts pop for unread notices the reader has not been shown yet IN THIS BROWSER
// SESSION, and fade after 5 seconds. sessionStorage holds the ids already shown,
// so navigating around the portal doesn't replay the same notice on every page —
// but signing in fresh tomorrow will show what arrived overnight.
//
// Everything time-related renders only after mount (the panel is closed and the
// toasts are empty during SSR), so local time can be used without a hydration
// mismatch.

const SEEN_KEY = "pts.toasted";
const TOAST_MS = 5000;

function relTime(iso: string, now: number, bg: boolean): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return bg ? "сега" : "just now";
  if (mins < 60) return bg ? `преди ${mins} мин` : `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return bg ? `преди ${hrs} ч` : `${hrs} h ago`;
  const d = new Date(t);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export default function NotificationBell({ items }: { items: Notification[] }) {
  const { lang, t } = useLang();
  const bg = lang === "bg";
  const [open, setOpen] = useState(false);
  // Optimistic: the badge clears the moment the reader opens the panel, without
  // waiting for the server round-trip that actually records it.
  const [cleared, setCleared] = useState(false);
  const [toasts, setToasts] = useState<Notification[]>([]);
  // Frozen when the panel opens, so the "5 min ago" line can't drift while it is
  // being read — and so nothing impure is called during render.
  const [openedAt, setOpenedAt] = useState(0);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const unread = cleared ? 0 : items.filter((n) => !n.readAt).length;

  // Pop anything unread that this browser session hasn't shown yet, then forget
  // it — one appearance per notice, per session.
  useEffect(() => {
    const seen = readSeen();
    const fresh = items.filter((n) => !n.readAt && !seen.has(n.id));
    if (!fresh.length) return;
    // Remembering them is a write to an external system, which is what this
    // effect is really for. Do it first, so a crash below can't cause a replay.
    try {
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh.map((n) => n.id)]));
    } catch {
      // private mode / storage full — the notice still shows, it just may repeat
    }
    const ids = new Set(fresh.map((n) => n.id));
    // Both the appearance and the removal are scheduled: React wants state that
    // follows an external system to arrive in a callback rather than synchronously
    // in the effect body, which would re-render every page load twice.
    const show = setTimeout(() => setToasts((cur) => [...cur, ...fresh]), 0);
    const hide = setTimeout(() => setToasts((cur) => cur.filter((n) => !ids.has(n.id))), TOAST_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setOpenedAt(Date.now());
    if (unread > 0) {
      setCleared(true);
      startTransition(() => {
        void markNotificationsReadAction();
      });
    }
  };

  return (
    <>
      <div ref={ref} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t("notif.title")}
          title={t("notif.title")}
          style={{
            position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 999, cursor: "pointer",
            border: "1px solid var(--line)", background: "#fff", color: "var(--ink)", fontSize: 15,
          }}
        >
          <span aria-hidden>🔔</span>
          {unread > 0 && (
            <span
              style={{
                position: "absolute", top: -3, right: -3, minWidth: 17, height: 17, padding: "0 4px",
                borderRadius: 999, background: "var(--red, #cf4911)", color: "#fff",
                fontSize: 10.5, fontWeight: 700, lineHeight: "17px", textAlign: "center",
                border: "2px solid #fff", boxSizing: "content-box",
              }}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        {open && (
          <div
            role="dialog"
            aria-label={t("notif.title")}
            style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, zIndex: 60,
              background: "#fff", color: "var(--ink)", borderRadius: 12, border: "1px solid var(--line)",
              boxShadow: "0 8px 28px rgba(0,0,0,0.18)", overflow: "hidden",
            }}
          >
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: 13, fontWeight: 700 }}>
              {t("notif.title")}
            </div>
            {items.length === 0 ? (
              <p style={{ margin: 0, padding: "18px 14px", fontSize: 13, color: "var(--muted)" }}>{t("notif.none")}</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 380, overflowY: "auto" }}>
                {items.map((n) => {
                  const text = (bg ? n.bg : n.en) || n.bg || n.en;
                  const body = (
                    <>
                      <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--ink)" }}>{text}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{relTime(n.createdAt, openedAt, bg)}</span>
                    </>
                  );
                  const rowStyle: React.CSSProperties = {
                    display: "flex", flexDirection: "column", gap: 3, padding: "10px 14px",
                    borderBottom: "1px solid var(--line)",
                    background: n.readAt ? "#fff" : "#f7faf4",
                    textDecoration: "none",
                  };
                  return (
                    <li key={n.id}>
                      {n.href ? (
                        <Link href={n.href} onClick={() => setOpen(false)} className="no-underline" style={rowStyle}>
                          {body}
                        </Link>
                      ) : (
                        <div style={rowStyle}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* the toasts — bottom-right, newest last, gone after 5 seconds */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          style={{
            position: "fixed", right: 18, bottom: 18, zIndex: 200,
            display: "flex", flexDirection: "column", gap: 8, maxWidth: "min(360px, calc(100vw - 36px))",
            pointerEvents: "none",
          }}
        >
          {toasts.map((n) => (
            <div
              key={n.id}
              className="pts-toast"
              style={{
                background: "#fff", border: "1px solid var(--line)", borderLeft: "4px solid var(--green-light)",
                borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.16)", padding: "10px 14px",
                fontSize: 13, lineHeight: 1.45, color: "var(--ink)",
              }}
            >
              {(bg ? n.bg : n.en) || n.bg || n.en}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
