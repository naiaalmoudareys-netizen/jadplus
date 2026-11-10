/**
 * Who is an owner, according to Salesforce (C-AUTH-3). JAD+ holds no Salesforce credentials: it asks the
 * finance worker through a Cloudflare service binding (FIN) with its own shared secret (PORTAL_KEY). The finance
 * worker can only call the read-only Apex class JADPlusIdentity, which answers for ONE email or mobile number.
 * Contract and Salesforce-side code: integrations/salesforce/README.md.
 */
import { ownerLookupResponse, type OwnerLookup, type SignInIdentifier } from '@jadplus/shared';
import type { Bindings } from '../env.js';

/** Looks one person up in Salesforce. Rejects if Salesforce cannot be reached or answers badly. */
export type OwnerDirectory = (env: Bindings, who: SignInIdentifier) => Promise<OwnerLookup>;

/** A sign-in or emergency must not hang on Salesforce. */
export const DIRECTORY_TIMEOUT_MS = 8000;

/** The internal address the finance worker answers on (never reachable from the internet). */
export const IDENTITY_URL = 'https://portal.internal/jadplus-identity';

export const financeWorkerDirectory: OwnerDirectory = async (env, who) => {
  // The private preview shows demo data only (CLAUDE.md): it never asks the real Salesforce.
  if (env.ENVIRONMENT === 'preview') throw new Error('The preview never connects to Salesforce');
  if (env.FIN === undefined || env.PORTAL_KEY === undefined || env.PORTAL_KEY === '') {
    throw new Error('The Salesforce link (FIN, PORTAL_KEY) is not configured');
  }
  const url = new URL(IDENTITY_URL);
  url.searchParams.set(who.kind, who.value);
  const res = await env.FIN.fetch(url.toString(), {
    headers: { 'x-portal-key': env.PORTAL_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(DIRECTORY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Salesforce identity lookup answered ${res.status}`);
  // The answer comes from outside JAD+, so it is validated like any other input (C-VAL-1).
  return ownerLookupResponse.parse(await res.json());
};
