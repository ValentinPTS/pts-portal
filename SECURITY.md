# Security — built in from the first commit

Security is a first-class requirement for this app (it holds confidential
participant identities, personal data, and signed reports). This file records
the posture; it is reviewed at every step.

## Already in place (Phase 1)
- **Baseline security headers** on every response (`next.config.ts`): `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`, `Strict-Transport-Security`.
- **No secrets in code** — all credentials come from environment variables (`.env`, never committed). See `.env.example`.
- **Input is validated, not trusted** — the PDF route whitelists `lang` and resolves the scheme by id against the store (unknown id → 404); the document is rendered server-side and only framed by our own origin (`frame-ancestors 'self'`).
- **Output is escaped** — the document renderer HTML-escapes all data values.
- **PDF generation is server-only** (Node runtime), and Playwright is kept an external package.

## Database (Supabase)
- The app reaches the database **server-side with the secret key** (service role); **Row-Level Security is ON with no public policies**, so the publishable/anon keys can read nothing from it. Per-owner, auth-scoped policies are added with the lab portal (Phase 2). See [SUPABASE-SETUP.md](SUPABASE-SETUP.md).
- Secrets live only in `.env.local` (gitignored) — never in code or the repo.
- ⚠️ **Credentials shared during setup must be rotated before launch** — see [ROTATE-BEFORE-LAUNCH.md](ROTATE-BEFORE-LAUNCH.md).

## Coming with the portal / data layer (Phase 2–3)
- **Authentication** via Supabase Auth; **mandatory 2FA for owner accounts** (Belovski, Kasabova, the partner); email-verified labs; brute-force lockout + rate limiting.
- **Row-Level Security (Postgres)** so a lab can only ever read its own rows, and the secret code↔lab mapping is owner-only. This makes ISO 17043 confidentiality structural, not UI-only.
- **EU-region hosting** (GDPR) and encryption at rest + in transit.
- **Safe file uploads** (non-EU verification docs): type/size limits, isolated non-executable bucket, virus scan, short-lived signed URLs from a separate domain.
- **Full Content-Security-Policy** with per-request nonces.
- **Immutable audit log**; issued reports/certificates locked + versioned; **PAdES cryptographic signatures**.
- **No card data** stored (bank-transfer model → out of PCI scope); dependency/vulnerability scanning; encrypted, tested backups.
