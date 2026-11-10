/** Cloudflare Worker entry point: wires real time, email delivery and the scheduled jobs into the app. */
import type { SignInIdentifier } from '@jadplus/shared';
import { createApp } from './app.js';
import type { Bindings } from './env.js';
import { runEscalationSweep } from './jobs/escalation.js';
import { createLogger } from './logger.js';
import { financeWorkerDirectory } from './salesforce/directory.js';

/**
 * Sign-in code delivery. Email (Microsoft Graph, jadplus@) and SMS are not connected yet, so outside a
 * developer's machine delivery fails safely: the failure is logged without the address or code, and the
 * person sees the same neutral answer as always (docs/adr/0003-sign-in-sessions-access.md, ADR 0005).
 */
function sendSignInCode(env: Bindings, to: SignInIdentifier, code: string): Promise<void> {
  if (env.ENVIRONMENT !== 'local') return Promise.reject(new Error(`${to.kind} delivery is not configured`));
  // Local development only (`wrangler dev` with ENVIRONMENT=local): show the code in the terminal.
  // eslint-disable-next-line no-console -- developer-only outbox; refused above in preview and production.
  console.log(`[local only] JAD+ sign-in code (${to.kind}): ${code}`);
  return Promise.resolve();
}

const app = createApp({ now: () => Date.now(), sendSignInCode, ownerDirectory: financeWorkerDirectory });

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runEscalationSweep(env.DB, Date.now(), createLogger({ job: 'escalation' })).then(() => undefined),
    );
  },
} satisfies ExportedHandler<Bindings>;
