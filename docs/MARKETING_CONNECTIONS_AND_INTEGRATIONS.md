# School Marketing Connections and Integrations

Last updated: July 27, 2026

## What is implemented

Directors can open **Settings & Setup → Integrations**, choose a marketing provider, and connect the school's account through that provider's OAuth login and consent screen. The resulting access and refresh tokens are encrypted server-side and scoped to the director's school.

Center Directors and Assistant Directors use the same school-scoped connection flow. They can reconnect or disconnect a provider without affecting another school. Disconnecting removes The BEE Suite's saved tokens and account selection; the director should also revoke The BEE Suite in the provider's own security settings when they want to withdraw the provider-side authorization.

The Campaigns workspace can:

- display connected ad-account status and 30-day campaign totals;
- sync campaign spend, impressions, clicks, leads, and campaign counts for Meta Ads, Google Ads, TikTok Ads, and LinkedIn Ads;
- display owned-profile analytics for Facebook, Instagram, LinkedIn, Google Business Profile, TikTok, Pinterest, and X;
- draft, schedule, and publish approved social posts through supported official APIs;
- automatically refresh expiring OAuth tokens when the provider issues a refresh token.
- exchange Meta's short-lived login token for a long-lived user token before saving the connection.

The application never asks a director to email, paste into chat, or expose a provider password. Platform OAuth client secrets remain deployment environment variables. Per-school user tokens remain encrypted `IntegrationCredential` records.

## Scope and authorization

- Marketing `Integration` and `IntegrationCredential` records use `scopeKey = center:<centerId>` for Center Director and Assistant Director workflows.
- Infrastructure integrations such as Stripe, SendGrid, Supabase, Twilio, and Google Sheets remain tenant-scoped.
- OAuth state is HMAC-signed, bound to the current BEE Suite user, tenant, school, provider, and a short-lived HTTP-only cookie.
- OAuth callbacks reject expired, tampered, cross-user, cross-tenant, and cross-school state.
- Account discovery never sends provider tokens to the browser. If a login controls multiple accounts, the UI receives only account IDs, labels, and kinds.
- Publishing and analytics routes re-check the BEE Suite session, role, tenant, and school scope on every request.
- Social publishing remains a human action. TikTok unaudited Direct Post stays private-only.

## Provider capability matrix

| Provider | OAuth login | Account discovery | Dashboard data | Publishing |
| --- | --- | --- | --- | --- |
| Meta Ads | Yes | Ad accounts | 30-day campaign metrics | External ad creation is not enabled |
| Google Ads | Yes | Accessible customers | 30-day campaign metrics | External ad creation is not enabled |
| TikTok Ads | Yes | Advertisers | 30-day campaign metrics | External ad creation is not enabled |
| LinkedIn Ads | Yes | Accessible ad accounts | 30-day campaign metrics | External ad creation is not enabled |
| Microsoft Advertising | Yes | Accessible ad accounts when the developer token is configured | OAuth and account discovery are ready; asynchronous reporting remains gated | External ad creation is not enabled |
| Facebook Pages | Yes | Pages and linked Instagram professional accounts | Followers and owned-profile counts | Text/link posts |
| Instagram | Via Meta | Linked professional account | Followers and media count | Public image posts |
| LinkedIn Pages | Yes | Administered organizations | Organization followers | Organization posts after Community Management approval |
| Google Business Profile | Yes | Accounts and locations | Search, click, call, and direction metrics | Local updates |
| TikTok | Yes | Current profile | Profile counts | Video Direct Post; public visibility requires TikTok audit |
| Pinterest | Yes | Profile and boards | Profile counts | Image Pins |
| X | Yes, OAuth 2.0 PKCE | Current profile | Profile counts | Text/link posts, subject to the active API tier |

No provider account is considered ready from token presence alone. The school must also select or save the required ad account, Page, organization, location, board, or profile identifier.

## Platform app configuration

Set `APP_URL` and `NEXT_PUBLIC_APP_URL` to the production origin before registering callback URLs. Each provider callback must exactly match:

```text
https://thebeesuite.io/api/integrations/oauth/<provider>/callback
```

Provider values for `<provider>` are:

```text
meta_ads
meta_social
google_ads
google_business
tiktok_ads
tiktok_social
linkedin_ads
linkedin_social
microsoft_ads
pinterest_social
x_social
```

Required platform environment variables:

| Provider family | Environment variables |
| --- | --- |
| Encryption/state | `INTEGRATION_CREDENTIALS_SECRET`, `INTEGRATION_OAUTH_STATE_SECRET` |
| Meta | `META_APP_ID`, `META_APP_SECRET`, optional `META_GRAPH_API_VERSION` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; Ads also needs `GOOGLE_ADS_DEVELOPER_TOKEN` |
| TikTok Ads | `TIKTOK_ADS_APP_ID`, `TIKTOK_ADS_APP_SECRET` |
| TikTok social | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, optional `LINKEDIN_API_VERSION` |
| Microsoft Ads | `MICROSOFT_ADS_CLIENT_ID`, `MICROSOFT_ADS_CLIENT_SECRET`, `MICROSOFT_ADS_DEVELOPER_TOKEN` |
| Pinterest | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET` |

Use a dedicated, randomly generated `INTEGRATION_CREDENTIALS_SECRET` in production. Rotating it without a credential re-encryption plan makes existing school tokens unreadable.

## Provider approval gates

OAuth code alone does not grant production access. Before a provider can be marked live:

1. Register The BEE Suite as a production application.
2. Add the exact production callback URL.
3. Publish current Terms of Service, Privacy Policy, and data-deletion instructions where the provider requires them.
4. Request only the scopes shown in the consent flow.
5. Complete provider business verification, app review, API access-tier approval, and test-user review where required.
6. Connect a provider-owned test school account first.
7. Verify account discovery, token refresh, analytics sync, and a non-sensitive test post.
8. Record the provider approval and operating owner before inviting directors to connect.

Relevant primary documentation:

- [Google OAuth for web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Ads OAuth](https://developers.google.com/google-ads/api/docs/oauth/overview)
- [Google Business Profile OAuth](https://developers.google.com/my-business/content/implement-oauth)
- [TikTok Login Kit](https://developers.tiktok.com/doc/login-kit-overview)
- [TikTok Content Posting](https://developers.tiktok.com/products/content-posting-api)
- [LinkedIn OAuth](https://learn.microsoft.com/linkedin/shared/authentication/authentication)
- [Microsoft Advertising OAuth](https://learn.microsoft.com/advertising/guides/authentication-oauth)
- [Pinterest authentication](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/)
- [X OAuth 2.0 with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)

## Deployment sequence

1. Deploy migration `20260727143000_school_scoped_marketing_integrations`.
2. Add the platform environment variables without adding any school access tokens to Vercel.
3. Deploy the application and register the exact production callbacks.
4. Complete provider review and approval.
5. Connect a controlled test-school account per provider.
6. Verify that another school director cannot see the connection, analytics, account candidates, drafts, scheduled posts, or publishing results.
7. Verify token refresh after the initial access token expires.
8. Enable director onboarding provider by provider. A technically working OAuth callback is not provider approval or school authorization.
