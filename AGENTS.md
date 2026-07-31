<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## BEE Suite operating contract

- Inspect and document the current state before changing it.
- Preserve unrelated dirty work and running processes. Use a fresh worktree from `origin/main` for releases or clean validation.
- Do not change user access, roles, Supabase Auth identities, school grants, invitations, PINs, billing, payouts, messages, provider connections, or rollout state unless the request explicitly includes that gate.
- Keep school and role isolation fail-closed. Treat Prisma application users and Supabase Auth users as separate identities.
- Run focused tests with `node --import tsx --test <files>`. The production gate is `npm run vercel-build`.
- Never force-push. Do not run `npm audit fix`, production migrations, live sends, card charges, app-store actions, or provider publishing without explicit authorization.
- A production release is complete only after the intended commit is Vercel Ready on canonical aliases, `/api/health` is healthy, relevant logs are clean, and the changed flow is verified.
- Clean up PRs, branches, and worktrees only after proving their work is merged, duplicated, obsolete, or deliberately retained.
