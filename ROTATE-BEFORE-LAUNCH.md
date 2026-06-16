# 🔐 Secrets to rotate before launch

These credentials were shared over chat during setup, so they should be treated as **exposed**
and **rotated** (regenerated) before the portal goes live — and ideally now. This file lists
**which** secrets and **how**; it deliberately contains **no actual key values** (so it's safe
to keep in the repo).

Project: `iialbrfbtzgfabugncud` (the PTS Supabase project).

| # | Secret | Risk | Why rotate | Where to rotate |
|---|--------|------|-----------|-----------------|
| 1 | **Database password** | 🔴 High | Full read/write to the whole database | Supabase → Project Settings → **Database** → *Reset database password* |
| 2 | **Secret API key** (`sb_secret_…`) | 🔴 Critical | Full server access, **bypasses Row-Level Security**. Used by the app server. | Supabase → Project Settings → **API Keys** → roll the secret key, then update `portal/.env.local` `SUPABASE_KEY` (and the Vercel env var) |
| 3 | **Publishable key** (`sb_publishable_…`) | 🟡 Low | Designed to be public, but was exposed; rotate for tidiness | Supabase → Project Settings → **API Keys** → rotate publishable key |
| 4 | **anon legacy JWT key** | 🟡 Low | Public by design; exposed | Supabase → Settings → **API Keys / JWT** (or simply migrate to the new publishable/secret keys and disable legacy) |
| 5 | **Direct connection string** | 🔴 High | Contains the database password (see #1) | Covered by rotating the database password (#1) |

After rotating #1 and #2, update `portal/.env.local` (and later the Vercel environment variables) with the new values and restart.

## Going forward — don't expose secrets again
- Put secrets **only** in `portal/.env.local` (gitignored) and in the host's environment variables (Vercel). Never in chat, email, screenshots, or committed files.
- The app uses the **secret key server-side only** — it is never sent to the browser.
- Turn on **2-factor authentication** on the Supabase, GitHub and Vercel accounts.
- Rotate keys again right before go-live, and whenever a key may have been seen by anyone who shouldn't have it.

## Other secrets that will appear later (same rules)
- `ANTHROPIC_API_KEY` (BG→EN translate helper).
- The **PAdES** document-signing certificate + passphrase.
- When the **lab portal** (Phase 2) launches: keep the **publishable** key for the browser and the **secret** key server-side only, and replace the permissive Phase-1 database access with **auth + per-owner Row-Level Security**.
