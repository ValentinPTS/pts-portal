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
   - the **publishable / anon** key

4. **Add them to the app** — create a file `portal/.env.local` (do NOT commit it):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_KEY=<your publishable/anon key>
   ```

5. **Restart** `npm run dev`. The app now reads/writes your database; the example scheme
   seeds itself automatically on first load. Schemes you create or edit now survive restarts.

> **Security note (Phase 1):** the migration's RLS policies are intentionally permissive because
> the table holds only non-confidential **scheme definitions** and the app is server-side + owner-only.
> Before any **participant** data is stored, we replace these with authenticated, per-owner policies
> and switch to a secret server key (Phase 2). See [SECURITY.md](SECURITY.md).
