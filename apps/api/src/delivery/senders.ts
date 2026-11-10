/**
 * Provider plug-in points for delivering alerts (ADR 0007). Each channel is connected to one provider once
 * Naya confirms it (SMS/voice, email via Microsoft Graph, later WhatsApp and app push). Until then a channel
 * has no sender and its deliveries fail visibly ("not_configured") on JAD+ Admin's undelivered list.
 *
 * A sender must never log the address or the message (C-LOG-1) and must reject (throw) when the provider
 * did not accept the message, so the delivery is retried.
 */
import type { Channel } from '@jadplus/shared';
import type { Bindings } from '../env.js';

export interface OutgoingMessage {
  /** Email address or international mobile number (+971...). */
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  /** Urgent alerts (E1, E5-E7) should use the provider's highest priority. */
  readonly urgent: boolean;
}

/** Hands one message to a provider; returns the provider's message id when it gives one. */
export type Sender = (
  env: Bindings,
  message: OutgoingMessage,
) => Promise<{ readonly providerRef: string | null }>;

export type Senders = Readonly<Partial<Record<Channel, Sender>>>;
