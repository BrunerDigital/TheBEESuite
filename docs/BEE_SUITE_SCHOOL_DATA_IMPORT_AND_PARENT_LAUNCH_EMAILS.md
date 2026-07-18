# The BEE Suite School Data Import and Parent Launch Email Kit

**Updated:** July 16, 2026  
**Purpose:** Ready-to-send emails that guide a school from ProCare export through BEE Suite import, school setup, payment readiness, and parent portal launch.

## How to use this kit

Send the emails in order. They are written so the same message can go to several school directors without editing names, dates, or school details.

- **Email 1** goes to the school director or ProCare administrator.
- **Email 2** goes to the person importing and reviewing the school's data.
- **Email 3** goes to the director, billing contact, and launch owner.
- **Email 4** goes to parents only after the school has passed the launch checklist.

Do not invite parents or accept live payments merely because an import completed. The school must review its data, access, billing rules, payout account, and parent experience first.

---

# Email 1: Export your school data from ProCare

**Subject:** Action needed: Export your school data from ProCare

Hello Directors and ProCare Administrators,

We are ready to begin moving your school information into The BEE Suite. The first step is to export each school's current information from ProCare.

Please complete the steps below as soon as possible. If your implementation team gave you a due date, please follow that date.

## Before you begin

Please make sure that:

- You are signed into the correct ProCare school or location.
- Your ProCare account is allowed to run reports and export data.
- You have a secure folder for the exported files.
- You export files for your school only.

If you manage more than one school, please create a separate folder and separate exports for each location.

## Export the data

ProCare menus may look slightly different depending on your version. For ProCare Desktop, the normal path is:

1. Open the ProCare Client and sign in.
2. Select **Family Data & Accounting** from the top menu.
3. Select **Reports**.
4. Select **Data Viewer**.
5. Choose the report or fields you need.
6. Set the report date or **As Of Date** to the current date when applicable.
7. Generate the report.
8. Select the arrow beside **Export**.
9. Choose **CSV** as the file type.
10. Save the file in a secure folder named for your school.

If you are exporting a Standard Report instead of a Data Viewer report, choose **CSV** or **Microsoft Excel – Data Only** whenever available. Please do not send password-protected, encrypted, PDF-only, or screenshot versions of data that must be imported.

## Files we need

Please export every area your school actively uses. At minimum, include:

- Family or account information
- Parents, guardians, payers, phone numbers, and email addresses
- Children, birth dates, enrollment status, start dates, and schedules
- Child-to-guardian relationships
- Authorized pickups and emergency contacts
- Classrooms, room assignments, age groups, capacities, and schedules
- Staff or employee records and classroom assignments
- Allergies, medical information, medications, and immunization information
- Attendance and sign-in/sign-out history, if it will be migrated
- Current family balances and open accounting information
- Tuition plans, recurring charges, fees, discounts, and subsidy information
- Any custom, tracking, or user-defined fields your school relies on

If one report does not contain all of this information, export multiple CSV files and give each file a clear name.

Suggested file names:

- `SchoolName_Families_Date.csv`
- `SchoolName_Children_Relationships_Date.csv`
- `SchoolName_Classrooms_Date.csv`
- `SchoolName_Staff_Date.csv`
- `SchoolName_Attendance_Date.csv`
- `SchoolName_Balances_Date.csv`
- `SchoolName_Medical_Immunization_Date.csv`

## Check the files before sending them

Please open each CSV and confirm:

- It contains records for the correct school.
- The first row contains column names.
- The file is not blank.
- Names, dates, emails, classrooms, and balances appear in separate columns.
- The file was not accidentally saved as a PDF or image.
- It does not contain records from another location.

## Send the files securely

Use the secure upload link or approved secure transfer method already provided by The BEE Suite implementation team. If you have not received one, reply to this email and request a secure upload link.

Please do **not** send child, family, medical, custody, staff, billing, bank, or payment information through ordinary email, text message, or a public link.

After uploading, reply to this email with:

- School name
- ProCare location name or ID
- Date and time of the export
- Names of the files uploaded
- Any reports you could not export
- Any fields your school uses that may need special attention

Once we receive the files, we will review the format before anything is added to the live school account.

Thank you,  
The BEE Suite Implementation Team

---

# Email 2: Import your ProCare data into The BEE Suite

**Subject:** Next step: Review and import your school data into The BEE Suite

Hello Directors and School Administrators,

Once your ProCare files are ready, follow the steps below carefully. The review step does not change live school records. The commit step does.

## Part 1: Sign in and confirm the school

1. Go to **https://thebeesuite.io/login**.
2. Sign in with your director, approved school administrator, or executive account.
3. Confirm that The BEE Suite shows your own school.
4. If the wrong school appears, stop and reply to this email. Do not upload the file.

## Part 2: Open the ProCare import area

1. Open **Family Detail** from the navigation menu.
2. Scroll to **ProCare Import**.
3. Under **Center**, select your school.
4. Do not choose another school. Executive users should use automatic location mapping only when the file contains reliable school or location identifiers and the implementation lead has approved bulk import.

## Part 3: Select the file and matching method

1. Under **CSV export**, choose the approved ProCare CSV file.
2. Leave **Duplicate matching** on **Balanced review** unless the implementation lead tells you to use another option.
3. Do not paste sensitive data into email or chat to ask whether a row is correct. Use the approved support process.

## Part 4: Run the safe review first

1. Select **Submit for Review**.
2. Wait for the **ProCare Import Review** window.
3. Review the number of:
   - Ready rows
   - Warning rows
   - New families and matched families
   - New children
   - New and matched staff
   - Balance rows
4. Review the center listed for the rows.
5. Review every duplicate candidate.
6. Review every warning or cleanup item.

Stop and reply to this email for support if:

- Any row is assigned to the wrong school.
- The import would create unexpected duplicate families, children, guardians, or staff.
- A large number of rows are missing names, birth dates, classrooms, or relationships.
- Balances appear under the wrong family.
- The counts are very different from ProCare.
- You do not understand a warning.

## Part 5: Approve duplicate decisions

If the review shows duplicate candidates:

1. Compare each candidate with the ProCare record.
2. Confirm whether it is the same family, child, guardian, or staff member.
3. Do not merge records based only on a similar name.
4. Check the confirmation box only after the duplicate decisions have been reviewed.

## Part 6: Commit the reviewed import

Only continue after the preview is approved.

1. Select **Commit Reviewed Import**.
2. Wait for the **Import complete** message.
3. Record the import batch number if it is shown.
4. Select **Download Import Backup**.
5. Save the backup with the school's implementation records.

Do not upload the same file again just because the page takes time to update. Contact support first so we can confirm whether the first import completed.

## Part 7: Verify the imported records

Before anyone uses the school account, compare The BEE Suite with ProCare and verify:

- Total active families
- Total active children
- Guardians, payer contacts, email addresses, and phone numbers
- Authorized pickups and emergency contacts
- Child birth dates, schedules, enrollment status, and start dates
- Classroom names, capacities, ratios, and child assignments
- Staff names, roles, classroom assignments, and login readiness
- Allergies, medical notes, custody warnings, and restricted visibility
- Current balances, open invoices, tuition rules, and opening ledger information
- Attendance history, if it was included

Please test at least several sample families from different classrooms. Confirm that each sample family has the correct children, guardians, classroom, balance, and safety information.

## Required approval

Reply to this email only after the review is complete and include:

- School name
- Import date
- Import batch number
- Family count
- Child count
- Staff count
- Any known exceptions or corrections still needed
- Director approval: **Approved** or **Not approved**

Do not invite parents, activate the kiosk, or collect live payments until the school setup and launch checklist in the next email is complete.

Thank you,  
The BEE Suite Implementation Team

---

# Email 3: Complete school setup before inviting parents

**Subject:** Required before parent launch: School setup and payment checklist

Hello Directors, Billing Contacts, and Launch Owners,

Each school's imported data must be reviewed and the school must be configured before parents are invited to The BEE Suite.

Please complete every section below for your own school. If a section is not ready, leave that feature off and reply to this email for help.

## 1. Confirm the school profile

In **School Setup** or the school settings area, verify:

- Official school name
- Address and time zone
- Main phone number
- School and director email addresses
- Notification recipients
- Public inquiry location status
- School logo and parent-facing name
- Support and emergency contacts

## 2. Confirm classrooms and staffing

Verify each classroom's:

- Name and age group
- Licensed or approved capacity
- Required staff-to-child ratio
- Active children
- Assigned teachers
- Schedule and operating hours

Then confirm that every teacher account is assigned to the correct school and classroom. Test one teacher login and make sure the teacher sees only the correct roster.

## 3. Confirm every family and child record

Review:

- Family and guardian names
- Parent email addresses and phone numbers
- Billing contact
- Children and classroom assignments
- Enrollment status and schedule
- Emergency contacts
- Authorized pickups
- Allergies and medical information
- Custody or restricted notes
- Photo, media, field-trip, and other permissions

Correct missing or inaccurate information before creating parent invitations.

## 4. Prepare the kiosk and attendance workflow

If the school will use BEE Suite check-in:

1. Open the center-specific kiosk page on the lobby device.
2. Confirm guardian PIN or QR credentials are ready.
3. Test a valid PIN.
4. Test an invalid PIN.
5. Test check-in, duplicate check-in, check-out, and checkout-before-checkin.
6. Test signature capture and authorized-pickup warnings.
7. Confirm attendance appears under the correct child, classroom, and school.

Do not use the kiosk for live attendance until these tests pass.

## 5. Prepare parent-facing features

Before invitations are sent, test a real or approved test parent account and confirm it can see only its own family.

Test:

- Parent login and password setup
- Correct children and classroom information
- Daily reports
- Approved photos and media
- Messages and announcements
- Documents and uploads
- Incident acknowledgement
- Contact-change requests
- Notification preferences
- Invoices, balances, and payment options if billing is enabled

Stop the launch immediately if a parent can see another family or child.

## 6. Confirm tuition and billing rules

The director and billing contact must approve:

- Tuition plans and amounts
- Weekly or monthly billing schedule
- Due dates
- Registration and other fees
- Discounts and credits
- Subsidy or agency rules
- Current balances and open invoices
- Late-payment and failed-payment process
- Refund and dispute process
- Autopay policy
- Parent-facing payment authorization and disclosure language

Do not generate live invoices until opening balances and tuition assignments have been checked against the previous system.

## 7. Set up the school's bank account for payouts

This is the school's Stripe payout setup. It is separate from a parent's ACH bank verification.

1. Sign into The BEE Suite with an approved billing-capable account.
2. Open **Billing Settings**.
3. Find your school in the Stripe Connect or payout table.
4. Select **Set Up**.
5. Continue to the secure Stripe-hosted onboarding page.
6. The authorized school or business representative enters the required business, identity, tax, and bank information directly into Stripe.
7. Complete every requested Stripe step.
8. Return to The BEE Suite.
9. Select **Check** to refresh the payout status.
10. Confirm that Stripe reports both **charges enabled** and **payouts enabled**.

Never email bank account numbers, routing numbers, tax documents, identity documents, login credentials, or Stripe secret keys. The BEE Suite does not need the school's full bank details; those details are entered through Stripe's secure page.

If the payout status is incomplete, open the Stripe setup again and complete the outstanding requirements. Parent payment checkout must remain disabled until the payout account is fully ready.

## 8. Test payments before inviting parents to pay

The billing and implementation team must complete an approved test that includes:

1. Create or select a test invoice.
2. Open it from an approved parent test account.
3. Confirm the family, invoice number, due date, and amount.
4. Test the approved bank-payment path.
5. Confirm the payment reaches the correct invoice only once.
6. Confirm the invoice and ledger update after the Stripe event is processed.
7. Confirm the connected school payout destination is correct.
8. Test a failed or pending payment path.
9. Confirm the parent-facing disclosures are correct.
10. Confirm refund, dispute, and support owners are documented.

Do not accept live payments if a test applies to the wrong invoice, applies twice, routes to the wrong account, or fails to reconcile.

## 9. Decide how parents will verify their banks for ACH

Once live payments are approved, parents can verify their own bank account in either of these ways:

- From the **Billing** area in their parent portal, by selecting **Verify Bank Instantly**; or
- From a secure BEE Suite payment-method setup link sent by the school.

The parent signs into the secure bank-verification page, chooses the checking account, confirms it, and returns to The BEE Suite. A pending bank setup or payment may take time to settle. Parents should not repeat the transaction while it is pending.

Never ask a parent to send bank account numbers, routing numbers, bank passwords, or screenshots of banking credentials.

## 10. Complete role and launch testing

Test each role that the school will use:

- Director
- Assistant director
- Billing administrator
- Teacher
- Parent or guardian
- Kiosk or authorized pickup

Confirm no user can see another school, classroom, family, child, message, document, incident, attendance record, or invoice outside their assignment.

## 11. Complete training and support setup

Before launch:

- Train directors on daily operations and escalations.
- Train teachers on attendance, reports, incidents, media, and parent-visible content.
- Train billing staff on invoices, payments, pending ACH, failed payments, and reconciliation.
- Confirm the parent instructions and invitation date.
- Confirm the first-week support contact and support hours.
- Record any feature that will remain disabled at launch.

## Final approval

Please reply with the checklist below:

- [ ] Imported data reviewed and approved
- [ ] School profile approved
- [ ] Classrooms, ratios, and staff approved
- [ ] Families, children, guardians, pickups, and safety records approved
- [ ] Teacher access tested
- [ ] Parent access and family scope tested
- [ ] Kiosk tested, or intentionally disabled
- [ ] Tuition, balances, and billing rules approved
- [ ] Stripe school payout account shows charges and payouts enabled, or parent payments are intentionally disabled
- [ ] Test payment and reconciliation passed, or parent payments are intentionally disabled
- [ ] Parent ACH instructions approved
- [ ] Documents, messages, incidents, and notifications tested
- [ ] Training and support plan confirmed
- [ ] Parent invitation date approved and recorded

Final launch decision: **GO / NO-GO**

In your reply, state that the checklist was approved by the director, billing or payment owner, implementation owner, and business or corporate approver.

Thank you,  
The BEE Suite Implementation Team

---

# Email 4: Parent portal invitation and ACH bank verification

**Send this email only after Email 3 receives a GO decision.**

**Subject:** Welcome to The BEE Suite parent portal

Hello Parents and Guardians,

Your school is inviting you to The BEE Suite parent portal. The portal gives you one secure place to view your child's updates, messages, documents, invoices, and approved school information.

## Set up your parent account

1. Open the secure BEE Suite invitation link sent by your school.
2. Confirm that the page shows your school.
3. Create your password or complete the requested sign-in step.
4. Sign in and confirm that you see the correct family and child or children.
5. If any family or child information is wrong, stop and contact your school.

You can also begin from **https://thebeesuite.io/parents**.

## Review your portal

Please check:

- Your name and contact information
- Your child or children's names
- Classroom and schedule information
- Authorized pickups and emergency contacts
- Documents or forms that need attention
- Messages and notification preferences
- Current invoices and balances, if billing is enabled

Use the contact-change request in the portal or contact the school if something needs to be corrected.

## Verify your bank for ACH payments

Bank payment is the preferred payment method when available. It may help you avoid card-related processing recovery charges.

1. Open **Billing** in the parent portal.
2. Review your family, invoice, due date, and amount.
3. Select **Verify Bank Instantly**.
4. Continue to the secure bank-verification screen.
5. Search for your bank.
6. Sign in through the secure bank portal.
7. Choose the checking account you want to use.
8. Confirm the account.
9. Return to The BEE Suite.
10. Wait for confirmation that your payment information was submitted.
11. Confirm that your saved payment method or autopay status updates.

If your status says **Pending**, do not repeat the setup unless the school tells you the first attempt failed.

## Pay an invoice by bank

1. Open **Billing**.
2. Select the open invoice.
3. Confirm the invoice number, due date, and amount.
4. Choose **Instant Bank**, **Pay With Instant Bank Login**, **One-Time Bank**, or **ACH**, depending on the options shown.
5. Follow the secure bank instructions.
6. Review the amount one more time.
7. Submit the payment.
8. Wait for the confirmation page.

ACH payments can take a few business days to settle. Do not pay the same invoice again while the first payment is processing.

## Important security reminders

- The BEE Suite and your school will not ask you to email or text your bank password, full bank account number, full card number, or routing number.
- Enter banking information only through the secure payment page opened from the parent portal or the approved BEE Suite link.
- Do not submit a payment if the family, invoice, or amount is wrong.
- Contact the school immediately if you see another family or child.

Need help? Contact your school using the phone number or email address you normally use for school questions.

Welcome to The BEE Suite!  
Your School Team

---

# Internal sending checklist

Before sending any email in this kit:

- Confirm the correct email is being sent to the correct audience.
- Use a secure upload link for ProCare exports.
- Confirm the recipient is authorized for the school.
- Never attach raw ProCare files to an ordinary email.
- Never request bank credentials by email.
- Keep parent payments disabled until school payout and payment testing are approved.
- Keep parent invitations disabled until data and family-scope testing pass.
- Save the import batch ID, backup, approvals, exceptions, and go/no-go decision.

## Implementation references

- The BEE Suite ProCare migration runbook: `docs/PROCARE_LOCATION_MIGRATION_RUNBOOK.md`
- The BEE Suite ProCare field map: `docs/PROCARE_FIELD_COVERAGE.md`
- School rollout checklist: `docs/SCHOOL_FULL_FEATURE_ROLLOUT_CHECKLIST_2026-06-08.md`
- Stripe payout setup: `docs/STRIPE_CONNECT_SETUP.md`
- Parent ACH guide: `docs/sops/PARENT_ACH_PAYMENT_GUIDE.md`
- Parent portal SOP: `docs/sops/PARENT_PORTAL_SOP.md`
- Official ProCare Desktop export instructions: `https://www.procaresupport.com/procare-desktop/docs/data-export-instructions`
- Official ProCare report export formats: `https://www.procaresupport.com/procare-desktop/docs/how-do-i-export-a-report`
