/** Cloudflare Worker entry point: wires real time, email delivery and the scheduled jobs into the app. */
import { createApp } from './app.js';
import type { Bindings } from './env.js';
import { runEscalationSweep } from './jobs/escalation.js';
import { createLogger } from './logger.js';

/**
 * Sign-in code delivery. Email through Microsoft Graph (jadplus@) is not connected yet, so outside a
 * developer's machine delivery fails safely: the failure is logged without the address or code, and the
 * person sees the same neutral answer as always (docs/adr/0003-sign-in-sessions-access.md).
 */
function sendSignInCode(env: Bindings, _email: string, code: string): Promise<void> {
  if (env.ENVIRONMENT !== 'local') return Promise.reject(new Error('Email delivery is not configured'));
  // Local development only (`wrangler dev` with ENVIRONMENT=local): show the code in the terminal.
  // eslint-disable-next-line no-console -- developer-only outbox; refused above in preview and production.
  console.log(`[local only] JAD+ sign-in code: ${code}`);
  return Promise.resolve();
}

/**
 * Which JAD+ user owns a Salesforce unit. Needs the finance-worker Salesforce proxy, which is not connected
 * (no Salesforce access without Naya's go-ahead, ADR 0004), so owners cannot raise requests by unit yet.
 * Tenants can, through their tenancy.
 */
function unitOwner(): Promise<string | null> {
  return Promise.reject(new Error('Salesforce unit lookup is not configured'));
}

const app = createApp({ now: () => Date.now(), sendSignInCode, unitOwner });

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runEscalationSweep(env.DB, Date.now(), createLogger({ job: 'escalation' })).then(() => undefined),
    );
  },
} satisfies ExportedHandler<Bindings>;
