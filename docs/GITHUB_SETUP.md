# GitHub Setup

The repository is hosted at `BrunerDigital/TheBEESuite` and deploys through Vercel.

## Cloud-First Workflow

- Use GitHub Codespaces for day-to-day development.
- Use feature branches and pull requests for changes.
- Use Vercel preview deployments for review.
- Merge to `main` only after CI and preview validation pass.

## Review Local State

Run this before pushing if you need to review commits that exist only in the current checkout:

```bash
git log --oneline -8
git status --short --branch
```

## Push A Branch

Create a branch for cloud work:

```bash
git switch -c codex/your-change-name
git push -u origin codex/your-change-name
```

Open a draft pull request:

```bash
gh pr create --draft --base main --head codex/your-change-name
```

## Cloud Environment

The Vercel project should hold production, preview, and development environment variables. Codespaces should pull development variables with:

```bash
npm run cloud:link
npm run cloud:env
```

## Repository Protection

Protect `main` and require the CI `validate` workflow before merging. Admins can keep bypass enabled for emergency recovery, but routine work should flow through pull requests.

The local `.env*`, `.vercel`, `.agents`, `node_modules`, `.next`, and other machine-specific files are ignored.
