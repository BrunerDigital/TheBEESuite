# Agency subsidy billing operations

This workflow keeps agency receivables separate from family balances. A family copay remains family responsibility; the agency-authorized portion is claimed, approved, and reconciled in the agency workspace.

## Before adding an agency program

Confirm the requirements with the agency's current official provider materials or assigned representative. Store links and identifiers, never portal passwords or bank credentials.

- Legal agency and program name
- State and local office or coalition, when applicable
- School provider number and vendor/payee number
- Provider agreement and rate agreement status
- Approved submission channel: state portal, secure email, EDI/API, or paper
- Claim frequency, cutoff, correction window, and payment terms
- Required attendance detail and absence/closure rules
- Authorization, enrollment, eligibility, and redetermination documents
- Required claim form, roster, sign-in/out evidence, or parent certification
- Family copay calculation and whether the agency deducts it from reimbursement
- Remittance method and the reference supplied with ACH, check, or portal payment
- Denial codes, dispute/appeal deadline, and contact path
- Record-retention and audit period

## Director workflow

1. Add the agency program for the selected school. Do not reuse another school's provider or vendor number.
2. Add each child's authorization with exact coverage dates, rate unit, authorized rate, units, and family copay.
3. Create the claim for a service period inside the authorization dates.
4. Complete every claim document item. Attendance and authorization evidence are required by default and may be supplemented with state- or agency-specific items.
5. Submit through the approved external channel. Then record the agency reference and mark the claim submitted in The BEE Suite.
6. Record the agency decision. Store denials and the appeal reason; do not convert a denied agency amount to a family charge without a separate responsibility review and authorization.
7. Record each remittance using the ACH, check, or portal reference. Partial payments stay open until the approved amount is reconciled.

## Stop and escalate

- The agency, child, family, and school do not all match.
- Service dates fall outside the authorization.
- Provider/vendor enrollment is incomplete or expired.
- Attendance evidence conflicts with the billed units.
- The agency approved more than the claim or paid more than the approved amount.
- A denial might shift responsibility to the family.
- A portal requires credentials, banking changes, an electronic signature, or an agreement not already approved by the school.
- Agency rules are unclear, outdated, or conflict with the authorization.

## Activation boundary

The BEE Suite records and prepares the receivable workflow. Marking a claim submitted does not transmit it to an agency portal. A provider-specific API, EDI connection, portal automation, or hosted online agency payment link requires separate technical verification, agency acceptance, credentials/consent, and production approval.
