/**
 * Where the owner app's residence data comes from (ADR 0010). Production: Salesforce, through the finance
 * worker's JAD+ door (same service binding and secret as the identity lookup, ADR 0005), for ONE verified email.
 * Everywhere else (local, preview): fictional demo data, so nothing ever touches real Salesforce data before
 * Naya's go-ahead.
 */
import { PAY_URL, dubaiDate, fromSalesforce, salesforceOwnerAnswer, type OwnerPortal } from '@jadplus/shared';
import type { Bindings } from '../env.js';
import { DIRECTORY_TIMEOUT_MS } from '../salesforce/directory.js';
import { demoOwnerPortal } from './demo.js';

/** Loads one owner's residence data by their verified email. Rejects if it cannot be loaded. */
export type OwnerPortalSource = (env: Bindings, email: string, now: number) => Promise<OwnerPortal>;

/** The finance worker's internal address for the owner's data (integrations/salesforce/README.md). */
export const OWNER_URL = 'https://portal.internal/jadplus-owner';

export const salesforcePortal: OwnerPortalSource = async (env, email, now) => {
  if (env.ENVIRONMENT !== 'production') throw new Error('Only production reads owner data from Salesforce');
  if (env.FIN === undefined || env.PORTAL_KEY === undefined || env.PORTAL_KEY === '') {
    throw new Error('The Salesforce link (FIN, PORTAL_KEY) is not configured');
  }
  const url = new URL(OWNER_URL);
  url.searchParams.set('email', email);
  const res = await env.FIN.fetch(url.toString(), {
    headers: { 'x-portal-key': env.PORTAL_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(DIRECTORY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Salesforce owner data answered ${res.status}`);
  // Validated, and reduced to what the app shows (C-VAL-1, data minimisation).
  const raw = salesforceOwnerAnswer.parse(await res.json());
  return { source: 'salesforce', ...fromSalesforce(raw, PAY_URL, dubaiDate(now)) };
};

export const demoPortal: OwnerPortalSource = (_env, _email, now) => Promise.resolve(demoOwnerPortal(now));

/** Production reads Salesforce; local and preview show demo data (CLAUDE.md: preview is demo data only). */
export const ownerPortalSource: OwnerPortalSource = (env, email, now) =>
  env.ENVIRONMENT === 'production' ? salesforcePortal(env, email, now) : demoPortal(env, email, now);
