# Local Cloud Setup

This workspace is configured for working directly on The BEE Suite `main` branch with GitHub, Vercel, and Supabase connected.

## Current Cloud Targets

- GitHub repo: `BrunerDigital/TheBEESuite`
- Vercel project: `the-bee-suite`
- Vercel team: `brunerdigitals-projects`
- Vercel project id: `prj_7hJhGdgUtCmonOXuOudqm7D48dmz`
- Supabase project: `TheBEESuite`
- Supabase project ref: `nqjrlktoewiueiwrubas`
- Production domain: `https://thebeesuite.io`

## One-Time Machine Setup

Install or verify these tools:

```powershell
node --version
npm --version
git --version
gh --version
vercel --version
supabase --version
docker --version
```

Expected working versions on this machine:

- Node `24.x`
- npm `11.x`
- GitHub CLI `2.94.0` or newer
- Vercel CLI `54.14.0` or newer
- Supabase CLI `2.106.0` or newer
- Docker Desktop is optional unless running local Supabase/Postgres containers

## Daily Start

From the repo root:

```powershell
git switch main
git pull --ff-only origin main
npm install
npm run cloud:link
npm run cloud:env
npm run cloud:status
npm run cloud:dev
```

Open `http://localhost:3000`.

This machine also uses `.env.development.local` for non-secret localhost URL overrides. That file is gitignored and survives `npm run cloud:env`.

## Cloud Scripts

- `npm run cloud:link` links this folder to the Vercel project.
- `npm run cloud:env` pulls production env vars, backs up `.env.local`, and preserves existing non-empty local secrets if Vercel returns blank values.
- `npm run cloud:env:development` pulls the sparse Vercel development env into `.env.development.pulled.local`.
- `npm run cloud:env:preview` pulls preview env vars into `.env.preview.pulled.local`.
- `npm run cloud:env:prod` pulls the raw production env snapshot into `.env.production.pulled.local`.
- `npm run cloud:dev` starts Next.js with the local `.env.local` file.
- `npm run cloud:status` checks local Git, Vercel, Supabase MCP, env, and CLI setup.
- `npm run cloud:validate` runs the production safety gate: audit, Prisma generate, lint, typecheck, tests, and Next build.

## Safety Rules While Schools Are Live

- Work on `main` only when intentionally changing the live production branch.
- Run `npm run cloud:validate` before pushing to `main`.
- Treat local writes as production-impacting whenever `.env.local` comes from `npm run cloud:env`.
- Keep local URL overrides such as `APP_URL` and `NEXT_PUBLIC_APP_URL` in `.env.development.local`, not `.env.local`.
- Keep `.env.local`, `.env.preview.pulled.local`, and `.env.production.pulled.local` out of Git.
- `.mcp.json` points Supabase MCP at production in read-only mode. Do not remove `read_only=true` for routine app work.
- For schema changes, create a tested migration first, run Supabase advisors, and only then apply to production.
- Do not run data repair scripts against production unless the exact target data and rollback path are known.

## Authentication Checks

```powershell
gh auth status
vercel whoami
supabase --version
```

If Vercel local auth expires, run:

```powershell
vercel login
npm run cloud:link
npm run cloud:env
```

If Supabase MCP auth expires, trigger the MCP auth flow in Codex/your agent and reload the session.

## Docker

Docker Desktop is only needed for local database/container workflows such as `supabase start`. The cloud-connected development loop does not require Docker to be running.

If Docker is needed:

```powershell
docker info
supabase start
```

If `docker info` cannot connect to the Linux engine, start Docker Desktop and wait until it reports that the engine is running.
