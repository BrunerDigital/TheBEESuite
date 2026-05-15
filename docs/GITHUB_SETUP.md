# GitHub Setup Handoff

The local repository is committed on `main`, but no GitHub remote is configured in this workspace.

## Current Local Commits

Run this before pushing if you want to review the local handoff stack:

```bash
git log --oneline -8
```

## Create And Push

After creating an empty GitHub repo, run:

```bash
git remote add origin https://github.com/YOUR_ORG/the-bee-suite.git
git push -u origin main
```

If GitHub CLI is installed and authenticated, this also works:

```bash
gh repo create YOUR_ORG/the-bee-suite --private --source . --remote origin --push
```

## After Push

1. Connect the GitHub repo to the existing Vercel project `the-bee-suite`.
2. Keep the current production alias: `https://the-bee-suite-beta.vercel.app`.
3. Confirm Vercel production env vars remain attached after connecting Git.
4. Enable protected branches and require the build check before merging future changes.

The local `.env*`, `.vercel`, `.agents`, `node_modules`, `.next`, and other machine-specific files are ignored.
