# Connecting your PTS Supabase account

The app uses Supabase when credentials are present, and an in-memory store otherwise —
so it runs right now without a database. To turn on real persistence, do this **in your
dedicated PTS Supabase account** (not the default one):

1. **Create the project** — in your PTS Supabase account → *New project*. Pick the **EU region**
   (Frankfurt / `eu-central-1`) for GDPR. Name it e.g. `pts-portal`. Wait until it's *Active*.

2. **Create the table** — open the project → **SQL Editor** → paste the contents of
   [`supabase/migrations/0001_schemes.sql`](supabase/migrations/0001_schemes.sql) → **Run**.

3. **Copy the credentials** — project → **Settings → API**:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - the **secret** key (`sb_secret_…`, Project Settings → API Keys) — server-side only, never in the browser

4. **Add them to the app** — create a file `portal/.env.local` (do NOT commit it):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_KEY=<your secret key>
   ```

5. **Restart** `npm run dev`. The app now reads/writes your database; the example scheme
   seeds itself automatically on first load. Schemes you create or edit now survive restarts.

> **Security note:** every table has row-level security ON with no policies, and since
> migration 0018 the browser-key roles (anon, authenticated) hold no rights at all — so the
> publishable key reads nothing. The app reads and writes only on the server, with the secret
> key. Apply migrations in order; the build on Vercel refuses to deploy while one is missing
> (`scripts/check-migrations.mjs`). See [SECURITY.md](SECURITY.md).
