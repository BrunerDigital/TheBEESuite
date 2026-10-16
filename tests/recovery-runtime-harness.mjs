import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const boundaryNames = ['@/lib/prisma', '@/lib/supabase-auth', '@/lib/parent-portal-setup-links', '@/lib/app-review-targeting', '@/lib/request-response-logging'];
const sources = {
  'next/server': `export function after() { throw new Error('Synthetic test has no Next request scope'); } export class NextRequest extends Request {} export class NextResponse extends Response { static json(body, init) { return Response.json(body, init); } }`,
  '@/lib/prisma': `export const prisma = new Proxy({}, { get: (_, key) => globalThis.recoveryFixture.db[key] });`,
  '@/lib/supabase-auth': `export const getSupabaseAuthEmailForAccessToken = (...args) => globalThis.recoveryFixture.identity(...args); export const updateSupabasePassword = (...args) => globalThis.recoveryFixture.update(...args); export const verifySupabaseRecoveryTokenHash = (...args) => globalThis.recoveryFixture.verify(...args);`,
  '@/lib/parent-portal-setup-links': `export const claimParentPortalSetupToken = (...args) => globalThis.recoveryFixture.claim(...args); export const completeParentPortalSetupToken = (...args) => globalThis.recoveryFixture.complete(...args); export const releaseParentPortalSetupToken = (...args) => globalThis.recoveryFixture.release(...args);`,
  '@/lib/app-review-targeting': `export const appReviewReservedIdentityKind = email => email === 'reserved@example.invalid' ? 'reserved' : null;`,
  '@/lib/request-response-logging': `export const withApiLogging = (_, handler) => handler; export const logOperationalError = (...args) => globalThis.recoveryFixture.logs.push(args);`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server' || boundaryNames.includes(specifier)) return { url: `fixture:${specifier}`, shortCircuit: true };
    if (specifier.startsWith('@/')) specifier = pathToFileURL(process.cwd() + '/src/' + specifier.slice(2)).href;
    if ((specifier.startsWith('.') || specifier.startsWith('file:')) && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(specifier + '.ts', context.parentURL); if (existsSync(url)) specifier = url.href;
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('fixture:')) return { format: 'module', source: sources[url.slice(8)], shortCircuit: true };
    return nextLoad(url, context);
  }
});
// Any accidentally unmocked provider call is a hard failure.
globalThis.fetch = () => { throw new Error('Network access forbidden in synthetic recovery tests'); };
