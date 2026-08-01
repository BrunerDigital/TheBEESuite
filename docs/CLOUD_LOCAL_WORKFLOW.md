# Cloud And Local Development Workflow

Last updated: July 31, 2026

Use one short-lived branch per coherent change. Cloud quick fixes and local larger work stay separate until each unit passes its own validation and preview review.

## Operating model

| Work | Workspace | Branch | Release path |
| --- | --- | --- | --- |
| Quick fix, idea, or debugging | GitHub Codespace | `work/cloud-<slug>` | Validate, preview, pull request, merge, production verification |
| Larger implementation | Dedicated local Git worktree | `work/local-<slug>` | Focused tests during development, then the same pull request and release gate |
| Production | Protected `main` only | `main` | Vercel Git deployment after a passing pull request |

Never develop directly on `main`. Never use the same branch in a Codespace and a local worktree at the same time.

## Start cloud quick work

From a clean, synchronized Codespace on `main`:

```bash
npm run codespace:setup
npm run work:quick -- invoice-print-layout
```

The helper refuses dirty, stale, duplicate, or incorrectly named work. Push the new branch with:

```bash
git push -u origin HEAD
```

## Start larger local work

From the primary local repository:

```powershell
npm run work:tree -- enrollment-redesign
```

This creates the sibling worktree `The Bee Suite 2-worktrees/enrollment-redesign` on `work/local-enrollment-redesign`. Enter that directory and run `npm ci`. The primary checkout stays available for releases, audits, and unrelated work.

## Validate and release one unit

1. Run focused tests while developing.
2. Run `git diff --check` and `npm run cloud:validate`.
3. Push the branch and review its Vercel preview, including the changed flow.
4. Open a pull request and wait for the required `validate` check.
5. Resolve all review conversations and merge the pull request.
6. Confirm the exact merged commit reaches Vercel `READY` on the canonical aliases.
7. Check the homepage, `/api/health`, runtime error logs, and the changed production flow.
8. Remove the completed branch and worktree only after proving the work is merged.

Application readiness does not authorize production data changes, access changes, invitations, messages, payments, provider changes, or a school rollout. Those remain separate gates.

## Environment safety

- Codespaces receives a repository-scoped `GITHUB_TOKEN`; do not replace it with a personal token.
- Store `VERCEL_TOKEN` as a Codespaces secret limited to `BrunerDigital/TheBEESuite`.
- Routine Supabase MCP access is pinned to the production project in read-only mode.
- `npm run cloud:env` pulls production-backed secrets. Use them for authenticated reproduction only when needed, and do not run mutation, import, billing, messaging, invitation, or migration commands without the matching approval.
- Never commit `.env.local`, pulled Vercel env files, database URLs, service-role keys, or provider tokens.
