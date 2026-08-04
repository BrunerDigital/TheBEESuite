# Reliability monitoring and response

The application emits privacy-safe structured operational errors. Alert rules should match the `operational.error` event and its `anomaly` field; messages and sensitive metadata are redacted before output.

## Recommended alerts

- `database_unreachable`: page immediately on any production occurrence.
- `auth_rate_limited`: warn on 5 occurrences in 10 minutes; investigate automation, abuse, or provider limits.
- `push_delivery_rejected`: warn on 10 occurrences in 15 minutes. HTTP 404/410 endpoints should remain bounded failures and be retired by the existing delivery flow.
- `provider_delivery_failure`: warn on 5 failures in 10 minutes.
- `application_error`: page on 10 critical occurrences in 5 minutes.

The Developer Dashboard shows unresolved client exceptions and push failures from the last 24 hours. SendGrid delivery state remains available under Integrations and is backed by `IntegrationDelivery` records.

## Synthetic parent checks

Run `npm run qa:parent-login` for the database-only preflight. Configure `SYNTHETIC_PARENT_CHECKS_JSON` with one synthetic account per active school. The checker refuses accounts unless they use the synthetic email namespace or have an explicit `syntheticTest: true` marker, have exactly one linked family, and belong to the configured school.

Actual Supabase authentication requires both `--live` and `ALLOW_SYNTHETIC_PARENT_LOGIN_CHECKS=true`. The script signs out immediately, never prints email addresses or passwords, and reports only a short account hash. Never configure a real parent account.
