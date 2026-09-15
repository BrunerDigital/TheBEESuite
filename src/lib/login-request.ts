/** Keep the first-factor payload compatible with strict credentialed QA. */
export function buildLoginRequest(input: {
  email: string; password: string; next: string; loginPortal: string;
  appMode: string; deviceLabel: string; mfaFactorId?: string; mfaCode?: string;
}) {
  const { mfaFactorId, mfaCode, ...passwordRequest } = input;
  return mfaFactorId || mfaCode
    ? { ...passwordRequest, mfaFactorId: mfaFactorId ?? "", mfaCode: mfaCode ?? "" }
    : passwordRequest;
}
