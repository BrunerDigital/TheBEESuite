# The BEE Suite Brand And Guide Style

Last updated: July 29, 2026

Use this as the canonical visual standard for public resources, role SOPs, printable packets, screenshots, and instructional graphics.

## Brand identity

- Product name: **The BEE Suite**
- Short name: **BEE Suite**
- Product line: **Childcare CRM & Operations**
- Primary mark: `public/brand/the-bee-suite/app-icon-dark.png`
- Dark-background mark: `public/brand/the-bee-suite/app-icon-yellow.png`
- Horizontal light-on-dark logo: `public/brand/the-bee-suite/logo-primary-horizontal-white.png`

Do not redraw the bee mark, stretch a logo, place a low-resolution mark in a printable, or use old Kid City setup-roadmap art as generic BEE Suite branding.

## Current visual language

The web app uses a warm glass system: soft warm-white or deep-navy canvases, translucent panels, thin neutral borders, BEE-gold focus accents, restrained module color, rounded corners, and clear operational hierarchy.

Core guide colors:

- Deep navy: `#05070A`
- Ink: `#111827`
- BEE gold: `#F5B51B`
- Gold highlight: `#FFD247`
- Warm white: `#FFFDF7`
- Soft gold: `#FFF4CF`
- Body gray: `#344054`
- Muted gray: `#667085`
- Border: `#EADFCA`

Printed material should use warm white as the page surface, deep navy or ink for text, and BEE gold for headings, table headers, rules, and small callouts. Dark full-bleed instruction graphics are acceptable when their text remains legible in print.

## Canonical current assets

- Instruction flows: `public/brand/the-bee-suite/explainers/current/`
- Role/device graphics: `public/brand/the-bee-suite/sop-graphics/current/`
- Privacy-safe role screenshots: `public/brand/the-bee-suite/screenshots/current/`
- Social and paid creative review pack: `public/brand/the-bee-suite/marketing/current/`
- Sendable Markdown and PDFs: `output/pdf/TEAM_SHARE_GUIDES_CURRENT/`

Do not create another dated or `v2`/`v3` sibling for an updated guide. Replace the canonical file, update its source, and rebuild the current packet. Git history preserves prior versions.

## Screenshot standard

- Use seeded demo records only.
- Exclude warning banners, browser developer controls, credentials, and production data.
- Teachers: lead with iPad; include desktop for review work.
- Directors and executives: desktop.
- Parents: lead with iPhone; include iPad and desktop where useful.
- Capture the current light or dark glass UI without mixing old and new navigation systems in the same guide.
- Crop only to remove empty browser chrome; do not crop away school, role, date, record, or save-state context needed to understand the workflow.

## Guide standard

- Keep role guides role-specific and task-first.
- Put school, role, family/child, billing, reporting period, or device scope checks before mutation steps.
- Distinguish implemented features, rollout-gated features, and roadmap items.
- Treat setup, parent invitations, kiosk/PIN, billing, payments, ProCare retirement, mobile stores, and wider-wave approval as independent gates.
- Use `HELD OFF`, `PASS`, `GO`, and `NO-GO` only when supported by the named evidence and owner decision.
- Never publish a shared or default password in a guide, screenshot, graphic, or template.
- Never request passwords, bank logins, full card numbers, medical files, custody files, or government identifiers through ordinary email or text.

## Printable standard

- US Letter portrait unless the content clearly requires landscape.
- Warm-white page, 0.7-inch or larger margins, dark body text, and BEE-gold accents.
- Minimum 9-point body type; use larger type for parent-facing one-page instructions.
- Repeat table headers and allow rows to grow.
- Keep each figure with its caption and verify every generated PDF page after rendering.
- The source Markdown is canonical. PDFs are regenerated artifacts, not independently edited copies.

## Update workflow

1. Confirm the current app flow and role/device view.
2. Update the canonical Markdown and stable asset source.
3. Regenerate `current` graphics and screenshots.
4. Rebuild `output/pdf/TEAM_SHARE_GUIDES_CURRENT/`.
5. Render every PDF page and inspect for clipping, overlap, broken tables, missing images, or stale branding.
6. Run the documentation tests and broken-reference scan.
