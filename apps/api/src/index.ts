/** Cloudflare Worker entry point: wires real time, message delivery and the scheduled jobs into the app. */
import type { SignInIdentifier } from '@jadplus/shared';
import { createApp } from './app.js';
import type { Bindings } from './env.js';
import { runDelivery } from './delivery/run.js';
import type { Sender, Senders } from './delivery/senders.js';
import { runEscalationSweep } from './jobs/escalation.js';
import { runPartnerReview } from './jobs/partner-review.js';
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

/**
 * Alert delivery providers (ADR 0007). None is confirmed yet, so preview and production have no senders: every
 * alert is marked undelivered and shows on JAD+ Admin's list. On a developer machine the alert text (which holds
 * no personal data) is printed instead; the address never is.
 */
const localSender =
  (channel: string): Sender =>
  (env, message) => {
    if (env.ENVIRONMENT !== 'local') return Promise.reject(new Error('Local sender used outside local'));
    // eslint-disable-next-line no-console -- developer-only outbox; never wired outside ENVIRONMENT=local.
    console.log(`[local only] ${channel}: ${message.subject} - ${message.body}`);
    return Promise.resolve({ providerRef: null });
  };

function sendersFor(env: Bindings): Senders {
  return env.ENVIRONMENT === 'local' ? { sms: localSender('sms'), email: localSender('email') } : {};
}

/** Must match the second cron in wrangler.toml. */
const DAILY_PARTNER_CHECK = '0 2 * * *';

const app = createApp({ now: () => Date.now(), sendSignInCode, ownerDirectory: financeWorkerDirectory });

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    const now = Date.now();
    // wrangler.toml: every minute = escalation (E5-E7) then alert delivery, so new alerts go out the same
    // minute; 02:00 UTC (06:00 Dubai) = daily partner check (S6, S7).
    const job =
      controller.cron === DAILY_PARTNER_CHECK
        ? runPartnerReview(env.DB, now, createLogger({ job: 'partner_review' }))
        : runEscalationSweep(env.DB, now, createLogger({ job: 'escalation' })).then(() =>
            runDelivery(env, sendersFor(env), now, createLogger({ job: 'delivery' })),
          );
    ctx.waitUntil(job.then(() => undefined));
  },
} satisfies ExportedHandler<Bindings>;
