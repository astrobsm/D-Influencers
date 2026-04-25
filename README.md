# D'Influencers Mentorship Hub

A full Network Marketing PWA — Progressive Web App with offline support, dashboard, prospecting kanban, appointments, presentations, closing, follow-ups, onboarding, team management, KPI tracking, and accountability tools.

**Tech:** Vanilla JS SPA · Express API · PostgreSQL (Supabase) · Chart.js · PWA (service worker + manifest)

---

## Quick Start (Local)

```powershell
npm install
copy .env.example .env   # then edit .env (or leave defaults — app falls back to local mode)
npm start
```

Open http://localhost:3000

The app **runs without a database** — it falls back to `localStorage` if the API/DB is unavailable.

### With local PostgreSQL

```powershell
# Create DB, then:
npm run setup    # runs migrations
npm start
```

---

## Deploy to Vercel + Supabase (Free)

### 1. Create a free Supabase project
1. Go to https://supabase.com → New project (free tier).
2. Wait for provisioning, then go to **Project Settings → Database → Connection string → URI**.
3. Choose the **Transaction pooler** (port `6543`) — required for serverless.
4. Copy the URI; replace `[YOUR-PASSWORD]` with the DB password you set.

### 2. Run the migrations against Supabase
From your machine (one-time):

```powershell
$env:DATABASE_URL="postgres://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
npm run migrate
```

### 3. Push to GitHub & import in Vercel
1. Push this repo to GitHub (already done if you ran the project setup).
2. Go to https://vercel.com → **New Project** → import this repo.
3. Framework preset: **Other** (Vercel detects `vercel.json`).
4. Add **Environment Variable**:
   - `DATABASE_URL` = your Supabase pooler URI
5. Click **Deploy**.

That's it. The site (static frontend + `/api/*` serverless) deploys to `https://<project>.vercel.app`.

---

## Project Structure

```
index.html, sw.js, manifest.json   # PWA shell
css/, js/, assets/                 # Frontend
backend/server.js                  # Express app (also runs as Vercel serverless)
backend/db.js                      # Postgres pool — supports DATABASE_URL or discrete vars
api/index.js                       # Vercel entry → re-exports backend/server.js
migrations/                        # SQL schema + seed
scripts/run-migrations.js          # Idempotent migration runner
vercel.json                        # Vercel routing
```

---

## Scripts

| Script | What it does |
|---|---|
| `npm start` | Start Express on `PORT` (default 3000) |
| `npm run dev` | Start with nodemon |
| `npm run migrate` | Apply SQL migrations |
| `npm run setup` | Same as migrate |

---

## License

MIT
