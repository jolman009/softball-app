# Deployment Runbook — Phase 5.5 Go-Live

Step-by-step to stand up production: **web on Vercel**, **API on Render**. The
code artifacts are already committed (`apps/web/vercel.json`, root `render.yaml`,
`.github/workflows/ci.yml`); the steps below are the dashboard work that only you
can do (your accounts). Companion: `PRE_LAUNCH_CHECKLIST.md` (the exit gate) and
`IMPLEMENTATION_PLAN.md` §5.5 (status).

Do it in this order — the API must exist before the web app can point at it, and
OAuth/Auth URLs depend on both domains being known.

---

## 0. Pin the env decision (5.5.3)
Reuse the **existing Supabase project as prod**, or split staging/prod? For a
solo soft-launch, reusing the existing project is the pragmatic call. Whatever
you choose, record it at the top of `IMPLEMENTATION_PLAN.md` §5.5.3.

> ⚠️ `ENCRYPTION_KEY` on the API host **must** equal the value that encrypted the
> existing `calendar_connections` rows. Rotating it orphans the coach's stored
> Google refresh token (they'd have to reconnect Google Calendar).

---

## 1. API on Render (do first — the web app needs its URL)
1. Render Dashboard → **New → Blueprint** → connect this repo. Render reads
   `render.yaml` and proposes the `softball-api` web service.
2. It will prompt for every `sync: false` secret. Set:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ENCRYPTION_KEY` (the existing one — see warning above)
   - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI` → `https://<your-render-subdomain>.onrender.com/api/calendar/google/callback`
   - `RESEND_API_KEY`, `EMAIL_FROM` (verified-domain sender — see §4)
   - `SENTRY_DSN`
   - `WEB_ORIGIN` → set to the Vercel production origin
     `https://softball-app-one.vercel.app` (no trailing slash). ⚠️ Do NOT leave
     this blank or use a non-URL placeholder — `config/env.ts` validates it with
     `z.string().url()` and the API **crashes at boot** on an invalid value.
     Update it later if you attach a custom domain, then redeploy.
   - (`NODE_ENV=production`, `TRUST_PROXY=1`, `DISPLAY_TIMEZONE`,
     `SENTRY_TRACES_SAMPLE_RATE=0` are already baked into `render.yaml`.)

   > **Build note:** `render.yaml`'s build command is
   > `npm ci --include=dev && npm run build -w @softball/api`. The `--include=dev`
   > is required because `NODE_ENV=production` makes `npm ci` skip devDependencies,
   > but the TypeScript build needs them (`typescript`, `@types/*`). Without it the
   > build fails with `TS7016: Could not find a declaration file for module 'express'`.
   > If you created the service before this fix, update the Build Command in the
   > Render dashboard (Settings → Build & Deploy) to match, or re-sync the blueprint.
3. Deploy. Confirm `GET https://<render-url>/api/health` returns
   `{ "ok": true, ... }`. (The API binds Render's injected `PORT` automatically.)

---

## 2. Web on Vercel (5.5.1)
1. Vercel → **New Project** → import this repo.
   - **Root Directory:** `apps/web`
   - Framework preset: **Vite** (auto-detected; `vercel.json` also pins it).
   - Build / output are read from `vercel.json` (`npm run build` → `dist`).
2. Environment variables:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE_URL` → `https://<render-url>/api`  *(note the `/api` suffix)*
   - `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`
3. Deploy. Note the production domain (e.g. `app.yourdomain.com` after §2.4).
4. Attach the custom business domain + verify HTTPS.
5. **Back to Render:** set `WEB_ORIGIN` to the Vercel production origin (e.g.
   `https://app.yourdomain.com`, no trailing slash) and redeploy the API so CORS
   allows the deployed web app.

---

## 3. Production OAuth & Auth URLs (5.5.3)
1. **Google Cloud Console** → the OAuth client → Authorized redirect URIs: add
   `https://<render-url>/api/calendar/google/callback` (must match
   `GOOGLE_OAUTH_REDIRECT_URI` exactly).
2. **Supabase → Authentication → URL Configuration:** add the Vercel prod origin
   to **Site URL** / **Redirect URLs** so Google sign-in and password-reset links
   resolve to production, not localhost.

---

## 4. Resend verified domain (carried over from Phase 5)
1. resend.com/domains → add + verify your sending domain (DNS records).
2. Set `EMAIL_FROM` on Render to an address on that domain, e.g.
   `On Deck <bookings@yourdomain.com>`. The default `onboarding@resend.dev`
   only delivers to the Resend account owner.

---

## 5. Phase 5 leftover — backup verification
Supabase → Database → Backups: confirm daily backups run and note the retention
window; enable PITR if the plan offers it. (This is the last open Phase 5 box.)

---

## 6. CI/CD (5.5.4)
- `.github/workflows/ci.yml` runs lint+typecheck on every PR — already live once
  merged.
- Vercel preview-per-PR + production-deploy-on-merge are **automatic** once the
  repo is connected in §2 (no code needed).
- Verify `deploy-supabase.yml` secrets (`SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`) target the prod project — or
  keep applying migrations via the dashboard SQL editor (outbound 5432 is blocked
  from the dev machine).
- Before booking works in prod, confirm all migrations are live on the prod DB
  (several were applied via the dashboard, not `db push`): booking holds, overlap
  constraints, `coach_settings`, `client_uploads`, profiles role lockdown — and
  seed at least one `availability_windows` row for the default coach.

---

## 7. Go-live smoke test (5.5.5) — run against the **deployed** URLs
- Signup → accept waiver → book → confirmation email → calendar event.
- Cancel >12 h (allowed) and <12 h (blocked).
- Two browsers race the same slot → one wins, one gets the conflict error.
- `/api/bookings` returns 429 after the rate-limit threshold.
- Trigger a deliberate prod error → confirm it lands in Sentry; confirm the
  PostHog funnel shows prod events.

When these pass, the Phase 5.5 exit criteria are met and soft-launch is live.
