# Landing Page Responsive QA

Last checked: June 2, 2026

Target: `https://thebeesuite.io`

## Viewports Checked

| Viewport | Size | Result | Screenshot |
| --- | ---: | --- | --- |
| Desktop | 1440 x 1200 | Passed | `docs/assets/responsive-qa/desktop-1440.png` |
| Tablet | 768 x 1024 | Passed | `docs/assets/responsive-qa/tablet-768.png` |
| Mobile | 390 x 900 | Passed | `docs/assets/responsive-qa/mobile-390.png` |

## Automated Checks

- Page title rendered as `The Bee Suite`.
- Hero heading rendered.
- SaaS childcare/preschool positioning copy was present.
- Primary CTA language was present.
- `nav`, `main`, and `footer` landmarks rendered.
- Horizontal overflow was `0px` at all checked sizes.
- Clipped interactive elements count was `0` at all checked sizes.
- Browser console/page error count was `0` at all checked sizes.

Raw Playwright metrics are saved at `docs/assets/responsive-qa/responsive-qa-results.json`.

## Visual Notes

- Desktop keeps the dashboard product preview and hero content balanced in the first viewport.
- Tablet stacks the hero and product preview without horizontal scrolling.
- Mobile keeps the nav, CTAs, dashboard preview, workflow cards, testimonials, reporting, and footer usable in one column.
- No overlapping text or obvious clipped buttons were observed in the captured screenshots.

