# Parent and teacher mobile screen audit

## Scope and baseline

Started from protected main `44b96c57` in the retained clean mobile worktree.
The shared checkout's unrelated changes were preserved. The review covered
parent Home, Updates, Messages, Payments, Children, Check-in, Documents, Billing,
Profile, Notifications, teacher workspace tools, both sign-in pages, and password
recovery including the forced-reset form. Existing parent review credentials
remain unusable; authenticated parent checks are not claimed.

At 320px and 200% text, the sign-in recovery link extended outside its card,
and recovery action labels clipped. Recovery pages also bypassed the shared
authentication theme. Parent recovery guidance incorrectly used school-account
copy for a destination with query parameters. Sign-in and reset lacked password
visibility controls. A generic submission notice covered the auth screen and
continued claiming a request was received after an inline rejection appeared.

## Changes

- Sign-in recovery links wrap, authentication card gutters stay compact, and
  action buttons grow with enlarged text.
- Recovery screens use the existing authentication theme and the shared role
  destination resolver for parent guidance.
- Password fields have 44px show/hide controls, accessible field-specific names,
  retained autocomplete attributes, and no submit behavior. Visibility starts
  concealed and is not stored.
- Client authentication forms use their own pending/error feedback, suppressing
  the generic submission notice.
- Browser audits now exercise touch input, portrait/landscape rotation, draft
  retention, visibility controls, and intercepted failure feedback.

## Browser evidence

- All 11 portal screens passed WebKit touch checks at normal and 200% text,
  including landscape and return rotation: 22 cases, no draft loss, layout
  findings, API/write attempts, or client exceptions.
- Parent and teacher navigation drawers passed 12 WebKit cases at widths 320,
  390, and 768 with normal/200% text; destinations and dismissal focus remained
  reachable.
- Account-screen audits cover 20 cases per engine (Chromium and WebKit), light
  and dark, 320/390px, normal/200% text, and rotation to 844x390 and back. Requests
  are fulfilled locally with synthetic errors; no email, password, identity,
  or production account is changed.
- Existing authentication hydration browser checks passed eight cases, and
  focused authentication/recovery/trust tests passed 16 tests.

Reports and screenshots are retained under `output/playwright` in this worktree.
Physical iPhone keyboard behavior and authenticated parent portal verification
remain separate evidence gaps. Neither is inferred from emulated browser QA.
