# Kiosk And Authorized Pickup Guide - The BEE Suite

Last updated: July 7, 2026

Audience: directors, front desk staff, parents, guardians, authorized pickups, and staff using the lobby kiosk.

## Purpose

The lobby kiosk lets verified adults check children in or out and lets staff clock in or out. Family check-in uses a center-specific 4 digit PIN or QR credential. Staff clock-in uses a 4 digit staff kiosk code.

## Visual Overview

![Lobby check-in](../../public/brand/the-bee-suite/usage/bee-suite-lobby-check-in.png)

## Director Setup

1. Confirm the child is linked to the correct family and classroom.
2. Confirm every guardian and authorized pickup is current.
3. Confirm custody and pickup notes are reviewed.
4. Set or reset the guardian 4 digit kiosk PIN.
5. Print or share the guardian QR card if the school uses QR check-in.
6. Open the center kiosk route on the lobby device.
7. Confirm the kiosk shows the correct school before families use it.
8. Test one check-in and check-out with an approved test record.

Do not run the lobby kiosk until `PIN_HASH_SECRET` or the approved production secret is configured.

## Parent Or Authorized Pickup Check-In

1. On the lobby kiosk, choose `Family`.
2. Choose `PIN` or `QR`.
3. If using PIN, enter the 4 digit code from the school.
4. If using QR, scan the QR credential from the school.
5. Tap `Find Family`.
6. Confirm the correct family appears.
7. Select the child or children arriving.
8. Type your full name as the guardian signature.
9. Tap `Check In`.
10. Wait for the confirmation message.

## Parent Or Authorized Pickup Check-Out

1. On the lobby kiosk, choose `Family`.
2. Enter the PIN or scan the QR credential.
3. Tap `Find Family`.
4. Confirm the correct family appears.
5. Select the child or children leaving.
6. Type your full name as the guardian signature.
7. Tap `Check Out`.
8. Wait for the confirmation message.

By tapping check in or check out, the adult confirms the selected children are arriving or leaving with the verified adult.

## Kiosk Warnings

Stop and ask the director or front desk for help if:

- The wrong family appears.
- A child is missing.
- A child appears who should not be connected to you.
- A protected pickup note or front desk verification warning appears.
- The kiosk says the credential could not be verified.
- The child should not be checked out yet.
- The balance/payment reminder does not look right.

## Staff Clock-In Or Clock-Out

1. On the kiosk, choose `Staff`.
2. Enter work email if the kiosk asks for it or if the code is not unique.
3. Enter the 4 digit staff code.
4. Tap `Find Staff Clock`.
5. Confirm your name, title, classroom, and current clock status.
6. Add an optional shift note if needed.
7. Tap `Clock In` or `Clock Out`.
8. Wait for confirmation before leaving the kiosk.

Teachers should not use another staff member's code.

## Front Desk Daily Routine

1. Open the kiosk before arrival time.
2. Confirm the correct school and date are shown.
3. Confirm the device is connected to the internet.
4. Confirm the screen auto-resets after use.
5. Watch for protected pickup, late pickup, tuition, or verification warnings.
6. Escalate child, pickup, custody, or wrong-family issues immediately.
7. Close or secure the kiosk at the end of the day.

## Security Rules

- Do not write PINs where other families can see them.
- Do not share one guardian's PIN with another adult.
- Reset a PIN if it may have been exposed.
- Do not leave a family result open on the kiosk.
- Use the `Start over` or reset behavior if a family walks away.
- Treat pickup, custody, and protected notes as sensitive.

## Troubleshooting

Contact the director or support owner with:

- School name.
- Guardian or staff name.
- Child name if relevant.
- Kiosk mode: Family or Staff.
- PIN or QR used, but do not send the full PIN in screenshots or messages.
- Action attempted: Find Family, Check In, Check Out, Find Staff Clock, Clock In, or Clock Out.
- Expected result.
- Actual result.
- Time of issue.
- Whether arrival or pickup is blocked.
