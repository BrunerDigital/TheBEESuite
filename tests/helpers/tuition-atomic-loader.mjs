import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Synthetic dependencies only. Never import a real database or provider client.
const root = fileURLToPath(new URL('../../', import.meta.url));
const mocks = {
  'next/server': 'export class NextRequest extends Request { get nextUrl() { return new URL(this.url); } } export const NextResponse = { json: (data, init) => Response.json(data, init) };',
  '@prisma/client': 'export const Prisma = { sql: (strings, ...values) => ({ text: strings.join("?"), values }) };',
  '@/lib/prisma': 'export const prisma = globalThis.__atomicTuition.db;',
  '@/lib/auth': 'export const getCurrentUser = async () => globalThis.__atomicTuition.actor; export const canManageBilling = u => u.role === "CENTER_DIRECTOR"; export const canAccessCenter = (u,id) => u.centerIds.includes(id);',
  '@/lib/request-response-logging': 'export const withApiLogging = (_m,h) => h;',
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks[specifier]) return { url: 'data:text/javascript,' + encodeURIComponent(mocks[specifier]), shortCircuit: true };
    if (specifier.startsWith('@/')) specifier = pathToFileURL(root + 'src/' + specifier.slice(2)).href;
    if ((specifier.startsWith('.') || specifier.startsWith('file:')) && !/\.[a-z]+$/i.test(specifier)) {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(candidate)) specifier = candidate.href;
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) return {
      format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { sourceUrl: url }),
    };
    return nextLoad(url, context);
  },
});
