# Package verification and release gaps

**Observed:** 2026-10-01. The checkout baseline before this package was `622aa8491a3ac03ef2a3db7bfae96527ad5cbd0b`; assigned branch `rollout/task-5-20260928`. The coordinator reported PR #445 at `665f89c3ef78a813cd0a14570e75f1b6e624cb8a` as the current canonical deployment. Public `/mobile-apps` was checked in browser on Oct 1. The UI check does not establish authenticated workflows or store-listing availability.

## Verified

- Public `https://thebeesuite.io/resources` was readable. It showed the current help-center structure for parents, teachers, directors, executives, billing admins, agency billing, and kiosk/pickup. It included descriptive image labels and role-specific alt text in the rendered page extraction. Route labels agree with `docs/sops/README.md` and `src/app/resources/page.tsx`.
- Public `https://thebeesuite.io/support` was readable and included family and team FAQ sections, secure-support boundaries, and instructions to contact the school directly for urgent child/pickup/same-day policy issues.
- Public `/directors` was readable as a sign-in page, and its text described the director workspace and school scope. Authenticated screens and actions were not inspected.
- `/app` extraction described the PWA/browser install paths and role entry points. Its last crawler observation was two months old, so it is historical context only, not today's UI verification.
- On Oct 1, the live browser opened `https://thebeesuite.io/mobile-apps` against the coordinator-reported current deployment `665f89c3`. The page displayed “Availability checked 2026-09-14”; both Parent and Teacher cards showed “Coming shortly” and “Public compatibility pending verification.” It directed users to role web sign-ins, stated Android users can use the web and no Android store release is verified, and stated iPad support still requires listing verification. The page has no store download link; actual public Apple listings remain UNVERIFIED and must not be advertised.
- The rendered mobile-apps page exposed Director, Teacher, Parent, Kiosk, and Executive sign-in links; all four role-guide PDF links; FAQ, support, privacy, terms, and all-guides links. These are the visible destinations, not a complete authenticated route check. Task 1 separately reports Parent/Teacher entry route 200; Director login page was publicly readable in the initial pass.
- `docs/sops/README.md` gives the public route map: `/parents`, `/teachers`, `/directors`, `/executives`; it separately specifies that school/module approval is required before distribution.
- The Parent and Teacher screenshot manifest states `nonNativeDraft: true`, capture source `/device-preview synthetic data`, dimensions 1290x2796, and requires replacement with matching captures from a signed TestFlight build before App Review. The eight listed PNG files exist and their PNG IHDR dimensions match 1290x2796.
- Resource source types require `graphicAlt` and screenshot `alt` text. The public resources extraction exposed meaningful image descriptions. The seven desktop/iPad screenshot files listed below have JPEG signatures while their file names end in `.png`; dimensions were decoded from image headers and preserved as observed.
- `src/lib/mobile-launch.ts` on the inspected current source sets `launchCheckedAt = 2026-09-14`; Parent and Teacher each have `url: null` and `verifiedAt: null`. `verifiedStoreUrl` fails closed without those values. No App Store URL is currently asserted by the launch source.
- Merged PR #442 documents the MacBook handoff. Its exact-source CI run 36653424977 passed the unsigned iOS release checks for Parent and Teacher on Xcode 26.6 at source `c19b9779de89279e3bbefc5906a01534f40af800`, including identity/privacy/HTTPS checks and cold launch/relaunch sign-in. The handoff records source version 1.0 build 5 for each app, build 4 selected in App Store Connect, and build 5 upload not verified. It explicitly leaves signing, authenticated native workflows, physical-device verification, TestFlight, and submission open. No public listing URL was found. See [merged handoff](https://github.com/BrunerDigital/TheBEESuite/blob/main/docs/IOS_MACBOOK_RELEASE_HANDOFF_2026-09-30.md).
- PR #445 (`665f89c3ef78a813cd0a14570e75f1b6e624cb8a`) is the reported current deployment and changes signed-out role routing to the role-specific login entry, following a Teacher build 5 sign-out/relaunch observation. This is a web app behavior fix; it does not show that a new native binary was uploaded or verified. The MacBook handoff's code baseline predates this change, so any later native verification should use the current canonical source and rerun the relevant source checks. The PR's publicly reachable sign-in page does not establish an authenticated workflow.

## Holds and defects to resolve

### PDF exports

`pdfinfo` reports the Parent, Teacher, Director, Executive, and Support role-guide PDFs in `output/pdf/TEAM_SHARE_GUIDES_CURRENT/pdf/` were created Sep 2, 2026. The share-folder README also says Sep 2. Later source and UI work includes the Sep 8 Director SOP update, Sep 13 UI work, Sep 23 role index update, and Sep 25 screenshot-gallery work. The SOP index says to rebuild after source SOP, public resource, UI label, route, or workflow changes. Therefore the share PDFs are held for regeneration and visual page review; the `CURRENT` folder name is not enough to establish freshness.

The adjacent Markdown copies also do not hash-match the canonical source Markdown. This is expected in part because generated copies adjust relative image paths and dates, but it means the output copy cannot substitute for the canonical source. No generated output was overwritten during this audit.

The school-transition folder says updated Sep 23 and its README lists six numbered attachments. Verify each actual PDF page/content against its canonical SOP before a school-specific send; the email packet itself remains manual and approval-gated.

### Asset encoding and sizes

Eight files in `public/brand/the-bee-suite/screenshots/current/` end with `.png` but contain JPEG data. Preserve originals and correct this at a separately reviewed export-refresh step (re-encode to PNG or rename/update all references consistently). Affected assets and actual dimensions:

| File | Encoded type | Dimensions |
|---|---|---:|
| `director-desktop-dashboard-light.png` | JPEG | 1425x990 |
| `director-desktop-reports-light.png` | JPEG | 1425x990 |
| `executive-desktop-admin-light.png` | JPEG | 1425x990 |
| `executive-desktop-dashboard-light.png` | JPEG | 1425x990 |
| `executive-desktop-fte-light.png` | JPEG | 1425x990 |
| `teacher-desktop-roster-light.png` | JPEG | 1425x990 |
| `teacher-ipad-daily-report-light.png` | JPEG | 1009x1346 |
| `teacher-ipad-roster-light.png` | JPEG | 1009x1346 |

All eight affected files are recorded above. App Store draft captures themselves are true PNG files with matching manifest dimensions.

The screenshot draft dimensions are internally consistent. No Apple submission decision is based on that match; these are explicitly synthetic non-native drafts.

### Store release

- The Sep 14 controlled-launch record is NO-GO and lists no verified public store URLs or approved binaries. The Oct 1 browser check confirms the public app page still presents no store link.
- The Parent and Teacher App Store Connect copy is a technically reconciled draft, not product/legal approval. Native signed archive, physical-device verification, final privacy/legal answers, and reviewer metadata remain open in the packets.
- `src/lib/mobile-launch.ts` has null store URLs and verification dates for both apps. Do not add a store badge or claim availability without exact, live listing links and approved-build evidence.
- No Android / Play Store listing or approved Android native app was identified. Preserve the browser/PWA language; do not imply a Google Play release.

### Brand and content

- The brand style source declares the logo paths and palette and prohibits logo redraw/stretch. Its internal date is July 29 even though repository history shows a later Sep 25 asset commit. Reconcile its documented date/version when the style source is next updated.
- No explicit font-family or font-license record was found in inspected brand assets. Mark the typeface as unverified.
- Public FAQ coverage exists at `/support`; there is no standalone canonical FAQ file. A Director clean-start guide has a role FAQ; the day-one guide refers to a “Parent Feature Guide & FAQ” action in the product. Do not invent a separate sendable FAQ artifact.
- The July 7 Kid City corporate checklist is old and contains dated school/contact/status details. Keep it out of current school outreach; use Sep 25 review-only copy and freshly verified recipient evidence.

## Link and final pass limits

The readable `/resources` page confirmed the resource center links as rendered in its crawl, and the live browser confirmed the deployed `/mobile-apps` page and its visible destinations. The Web reader could not open several direct role endpoints or `/privacy`. That makes the following **UNVERIFIED**: actual App Store listing destinations/availability, privacy-page response, every direct deep-link response, authenticated Parent/Teacher/Director/Corporate UI, and role-scoped workflow behavior. The mobile-apps page currently asserts no listing is available; do not invent a URL. This report is not a production or business activation approval.

No test invitations, messages, charges, billing changes, store actions, publishing, or school access changes were performed.
