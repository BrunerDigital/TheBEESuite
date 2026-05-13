# Go-Live: GitHub, Supabase, and Vercel

## 1. GitHub

Create a GitHub repository, then push this local repo:

```bash
git remote add origin https://github.com/YOUR_ORG/the-bee-suite.git
git push -u origin main
```

CI runs lint, typecheck, Prisma client generation, and production build on pushes to `main`.

## 2. Supabase

Create a Supabase project and copy the pooled database connection string.

Set local `.env`:

```bash
DATABASE_URL="postgresql://..."
SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
```

Apply the schema with either Prisma:

```bash
npm run db:push
npm run db:seed
```

Or apply the generated SQL migration:

```bash
supabase db push
```

Migration file:

```text
supabase/migrations/202605130001_initial_bee_suite.sql
```

Before real production use, add RLS policies, tenant-scoped query enforcement, and storage bucket policies.

## 3. Vercel

Import the GitHub repo into Vercel.

Build settings are included in `vercel.json`:

```json
{
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "npm run vercel-build"
}
```

Add Vercel environment variables from `.env.example`, especially:

```text
DATABASE_URL
NEXT_PUBLIC_APP_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AUTH_SECRET
```

Use preview deployments first, then promote to production after auth, RBAC, RLS, and integration checks are complete.
