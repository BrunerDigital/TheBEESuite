# Cloud Development

This repo should be worked from GitHub and Codespaces, with Vercel handling previews and production deploys.

## Source Of Truth

- GitHub repository: `BrunerDigital/TheBEESuite`
- Default branch: `main`
- Production deploy target: Vercel project `the-bee-suite`
- Production domains: `thebeesuite.io`, `www.thebeesuite.io`, and the Vercel project aliases

Do not commit `.env*`, `.vercel`, `.next`, `node_modules`, or local generated output.

## Start A Cloud Workspace

1. Open the repository in GitHub.
2. Choose **Code** > **Codespaces** > **Create codespace**.
3. Wait for the devcontainer to finish `npm ci` and `npm run db:generate`.
4. Link the Codespace to Vercel once:

```bash
npm run cloud:link
```

5. Pull development-scoped Vercel variables into the Codespace:

```bash
npm run cloud:env
```

6. Start the app:

```bash
npm run dev
```

For one-off runs without writing `.env.local`, use:

```bash
npm run cloud:dev
```

## Environment Policy

Vercel is the environment-variable source of truth. Scope secrets by environment:

- `production`: live app only.
- `preview`: pull requests and branch previews.
- `development`: Codespaces and cloud dev.

Development and preview should use a non-production Supabase project/database when available. Do not point routine feature work at the live production database.

Required development variables mirror `.env.example`; the minimum live-backed cloud dev set is:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `AUTH_SECRET`
- `PIN_HASH_SECRET`

Public browser variables must use `NEXT_PUBLIC_`. Backend keys such as `SUPABASE_SECRET_KEY`, Stripe secrets, Twilio tokens, SendGrid keys, and database URLs must stay server-only.

## Daily Workflow

1. Create or switch to a feature branch in Codespaces.
2. Make changes in the cloud workspace.
3. Run:

```bash
npm run cloud:validate
```

4. Push the branch and open a pull request.
5. Use the Vercel preview deployment for review.
6. Merge to `main` only after CI and preview validation pass.

## Production Releases

Production deploys should happen through GitHub `main` and Vercel, not manual local deploys. Before merging:

- Confirm the PR scope and affected roles.
- Confirm whether migrations or env changes are included.
- Run `npm run cloud:validate`.
- Check the Vercel preview.
- After merge, watch the production Vercel deployment and smoke-test `/api/health`.
