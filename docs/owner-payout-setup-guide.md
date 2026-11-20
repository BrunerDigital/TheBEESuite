# Owner guide: set up your school's payouts

Start in [The BEE Suite owner workspace](https://thebeesuite.io/owner). You launch payout setup from The BEE Suite and complete business verification and bank entry on Stripe's secure hosted pages. When you return, The BEE Suite checks the school's saved progress.

Use the BEE Suite login assigned to you and work on one school at a time. Confirm the selected school's name before entering or confirming any business or bank information.

## Have these details available

The person completing setup must be authorized to represent the selected school. Stripe determines the information needed for that account and may ask for:

- The legal business name, business address, tax identification information, and business structure.
- The authorized representative's contact and identity information, and ownership details where required.
- Verification documents requested by Stripe.
- The exact routing and account numbers for the bank that should receive this school's payouts.
- Access to the email address and authentication method authorized for the school's existing Stripe account.

Enter sensitive information only in Stripe's secure flow. Keep passwords, full bank numbers, tax identifiers, and identity documents out of email and text messages.

## Sign in and choose the school

1. Open [thebeesuite.io/owner](https://thebeesuite.io/owner). If you are signed out, the page takes you to BEE Suite sign-in and returns you to the owner workspace afterward.
2. Use your assigned BEE Suite email and password. If this is your first sign-in, use the setup details provided securely and change your temporary password when prompted. If you already use The BEE Suite, use your current password. Use **Forgot password** on the sign-in screen if needed.
3. If you manage several schools, choose the school you want to set up. The owner workspace shows the selected school and provides **Change school** for switching to another assigned location. If your school is missing or the school shown is incorrect, contact your administrator before proceeding.
4. Select **Stripe billing and payouts**. This opens Billing Settings. Find **Payout setup / School payout accounts**, or open [the payout setup section](https://thebeesuite.io/billing-settings#payout-setup) after selecting your school.

## Complete secure Stripe setup

1. Confirm the school's name in the payout section. Choose the action shown for that school:

   | Action | What to do |
   | --- | --- |
   | **Start Stripe setup** or **Continue Stripe setup** | Review the school profile, correct any requested fields, and select **Continue Secure Payout Setup**. |
   | **Finish Stripe setup** | Review the selected school and the verified Stripe contact email when shown. Confirm that you are authorized to represent the school, then select **Continue to Stripe sign in or setup**. |
   | **Connect payout bank** | Open the school's secure payout session to add or confirm its payout destination. Allow pop-ups for The BEE Suite if the browser blocks the new window. |

2. Follow the account-specific Stripe pages opened from The BEE Suite. For an existing account, use the Stripe login authorized for that account. The Stripe contact email shown after verification can differ from your BEE Suite login email. Follow Stripe's sign-in or account-access instructions; use Stripe's password-reset option if needed. Do not create a separate connected account to get around an access problem.
3. Complete the required business and representative information and review Stripe's terms. Enter or confirm the exact payout bank for the selected school. Check the school and destination again before submitting.
4. Finish Stripe's steps and return to The BEE Suite using the return option provided. If you opened a separate payout window, return to the original BEE Suite tab afterward.

The BEE Suite password and Stripe password are separate. The BEE Suite does not receive or store your Stripe password. Opening the setup page does not switch the school's payment account or remove its existing payout bank; any replacement-account switch is handled separately.

## Check the saved result

Refresh the school's Stripe status after returning. In the school payout table, select **Check**. On a replacement-account setup page, use **Check saved progress**. A corporate verification page uses **Check Stripe status**.

Confirm that the displayed bank name and last four digits match this school's intended payout account. The default payout bank must be confirmed; a completed form or successful return to The BEE Suite alone does not establish payout readiness.

| Result shown | What it means and what to do |
| --- | --- |
| **Requirements due** | Open the school's secure setup again and complete the remaining required information. |
| **Stripe review** or **Stripe review in progress** | Stripe is reviewing the submission. Check later and respond to any further requests through Stripe. |
| **Charges pending** or **Payouts pending** | Stripe has not enabled that capability. Check for requirements or contact support if the status persists. |
| **Payout bank needed** | Use **Connect payout bank**, then return and select **Check** to confirm the destination. |
| **Authorization complete** or a message that the replacement is ready for controlled cutover | The replacement-account authorization is complete. The authorized team must still confirm the account switch separately. |
| **Activation needed** | Stripe and the payout bank are ready. Final BEE Suite billing activation still requires the authorized team's review. |
| **Payments live** | The school's approved parent-payment flow is enabled. This does not confirm that a specific payout has reached the bank. |

Final billing activation is a separate step. Continue the school's current approved operating and billing process until its transition is confirmed. Payout setup does not authorize parent invitations, a new billing period, charges, or an account switch.

For several schools, return to [the owner workspace](https://thebeesuite.io/owner), select **Change school**, and repeat these steps for each assigned location. Confirm each school's own bank separately, even if the same owner manages them.

## If you need help

| Issue | Next step |
| --- | --- |
| BEE Suite sign-in fails | Verify your assigned email and use **Forgot password**. If the reset does not arrive or your login has not been provided, contact your administrator. |
| You land on another workspace or no school is assigned | Contact your administrator to verify your owner login and exact school assignments. |
| A school is missing or belongs to someone else | Stop setup for that school and request an assignment review. |
| Stripe asks for a different login or an unfamiliar contact email is shown | Do not guess credentials or create another connected account. Ask the authorized school representative or support to review access to the existing Stripe account. |
| The secure link expired or has already been used | Return to The BEE Suite and reopen that school's setup action for a fresh session. If sign-in is requested again, complete it and resume the same school's setup. |
| A pop-up was blocked | Allow pop-ups for The BEE Suite and choose **Connect payout bank** again. |
| Stripe progress cannot be checked | Keep your place in The BEE Suite and retry the school's status check later. Report the selected school, the visible error, and when it occurred. |
| The bank name or last four digits are wrong | Stop before further activation and contact the authorized administrator to review the school and payout destination. |
| You need to finish later | Follow Stripe's save or return options, then reopen setup from The BEE Suite when ready. If you skip bank entry, return later to complete it. You can still use your assigned BEE Suite workspace. |

Send support the school name, visible status or error, and the time it occurred. Keep sensitive credentials and financial details out of the message.

## Internal distribution note

This guide is prepared for review. Before sending owner setup instructions, reconcile the exact recipient list with active application accounts, confirmed and available Auth identities, and current school grants. Resolve missing or pending identities through the separately authorized provisioning process. Verify the applicable live Stripe account and any replacement target for each included school. Do not email temporary Stripe Account Link URLs; use the stable BEE Suite owner link so the authenticated app can open a fresh school-specific session.
