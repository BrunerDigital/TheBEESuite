# Landing branding refresh — October 7, 2026

## Scope and source state

Started from clean main `9ead60a6e9090a98614090074ff8e825c6793cad`. The public landing used a cream backdrop, a front-desk/device collage, and existing classroom/operations imagery. The refresh uses the September 29 brand reference, baby blue and honey yellow, the existing actual horizontal wordmark, and distinct school photography. No application APIs, authentication, school data, billing settings, or access rules are edited.

## Design and verification

Concept: `generated_images/exec-03d3cfbf-6cb7-4bcb-94e8-046200713019.png` in the task workspace. The user approved the visual direction and then requested the actual logo and non-repeating imagery.

Browser preview could not reach the isolated local server. Playwright Chromium was used for rendered screenshots and interaction checks at 390, 768, and 1536 pixels, in light and dark themes, with reduced motion. The local preview used a non-production Supabase configuration with no authenticated cookies. Role tabs and theme switching work; visible images load; there is no horizontal page overflow. Generated artwork is illustrative; role previews remain existing product screenshots.

### Fidelity ledger

| Point | Reference and final implementation |
| --- | --- |
| Copy | Existing headline, supporting copy, navigation and CTAs retained. Above-the-fold copy diff: no additions or renamed actions. |
| Palette | Baby-blue light hero, white sections, honey-yellow actions, navy dark surfaces. |
| Typography | Bold navy/white headline; size tuned for cleaner phone and desktop line breaks. |
| Composition | Human brand imagery behind real director and parent device previews; responsive stacking on phones. |
| Logo | User-directed deviation: actual horizontal wordmark replaces the concept's invented mark. |
| Photography | User-directed deviation: separate original hero, classroom, and reception scenes replace repeated concept photography. |
| Page structure | Existing role tabs, workspace links, setup links, and support/footer paths retained rather than adopting the concept's abbreviated downstream page. |

Concept and rendered screenshots were visually inspected with `view_image`; the palette, spacing, native copy, device framing, logo, and responsive composition were compared. Intentional deviations are recorded above.

## Validation

- Focused landing tests: 8 passing.
- Repository lint and TypeScript checks passed. Type checking needed a larger Node heap in this environment.
- Full tests: 2,666 passing plus 5 cron tests with `TZ=UTC`. The environment default was Asia/Ho_Chi_Minh; the existing staff-schedule date test assumes a timezone that yields June 3 in UTC, so the initial environment-only failure was resolved by running in UTC.
- Production build passed.
- The repository's web-push postinstall patch was applied after installing dependencies with scripts disabled.

Release readiness is verified separately against the final commit and canonical deployment. Screenshots and browser helpers are temporary QA artifacts, not product files.
