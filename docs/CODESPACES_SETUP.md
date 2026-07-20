# The BEE Suite Codespaces Setup

This repository now provides the Node 24, GitHub CLI, Docker, Vercel, and Supabase tooling needed for a consistent cloud development environment.

## One-time setup

1. In Vercel, create a personal CLI token for the `brunerdigitals-projects` team.
2. In GitHub, open **Settings > Codespaces > Secrets > New secret**.
3. Create a secret named `VERCEL_TOKEN`, paste the Vercel token, and grant it access only to `BrunerDigital/TheBEESuite`.
4. Rebuild the Codespace so the repository's `.devcontainer/devcontainer.json` is applied.
5. In the Codespace terminal, run:

   ```bash
   npm run cloud:link
   npm run cloud:env
   npm run cloud:status
   ```

GitHub automatically supplies a short-lived, repository-scoped `GITHUB_TOKEN` to the Codespace. Do not replace it with a personal token. It supports pull and push access to this repository without copying credentials from a local computer.

Supabase production credentials come from the Vercel environment pull and remain in ignored local environment files. Never commit `.env.local`, a Vercel token, a Supabase service-role key, or a database URL.

## Normal change and release flow

1. Create a focused branch instead of changing `main` directly.
2. Make the change and run `npm run cloud:validate`.
3. Push the branch and verify its Vercel preview deployment.
4. Merge only after CI and the preview flow pass.
5. Verify the production deployment, `https://thebeesuite.io/api/health`, logs, and the changed live workflow.

Use `npm run codespace:setup` at any time for a quick authentication and linkage check. It prints status only and does not reveal secret values.
