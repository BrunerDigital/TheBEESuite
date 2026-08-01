## Scope

- What changed:
- Why this is one coherent release:
- Sensitive gates explicitly not changed (data, access, billing, messaging, providers, rollout):

## Validation

- [ ] Focused tests for the changed behavior
- [ ] `git diff --check`
- [ ] `npm run cloud:validate`
- [ ] Vercel preview inspected and changed flow verified as far as authentication permits

## Production verification

- [ ] Exact merged commit reached Vercel `READY`
- [ ] `thebeesuite.io` and `www.thebeesuite.io` point to the intended deployment
- [ ] Homepage and `/api/health` are healthy
- [ ] Runtime error logs are clean
- [ ] Changed production flow verified, or the authentication/evidence boundary is recorded
- [ ] Rollback target recorded before promotion
