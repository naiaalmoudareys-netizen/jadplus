/** Delivers the notifications outbox (ADR 0007): split new alerts into deliveries, then send what is due. */
import { keysFor } from '../context.js';
import type { Bindings } from '../env.js';
import type { Logger } from '../logger.js';
import { fanOut } from './fan-out.js';
import { sendDue, type SendResult } from './send.js';
import type { Senders } from './senders.js';

export async function runDelivery(
  env: Bindings,
  senders: Senders,
  now: number,
  log: Logger,
): Promise<SendResult & { readonly fannedOut: number }> {
  const fannedOut = await fanOut(env.DB, now, log);
  const sent = await sendDue(env, await keysFor(env), senders, now, log);
  return { fannedOut, ...sent };
}
