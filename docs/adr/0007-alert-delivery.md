# ADR 0007 — Delivering alerts: engine now, providers later

Date: 10-Nov-2026 · Decided by: Claude (Naya: providers listed but not confirmed; "just build it") · To review: Naya

## Context

The emergency engine writes every alert it must send to the `notifications` outbox (ADR 0004). Nothing was
sent. Providers for SMS/voice, WhatsApp and email (Microsoft Graph) are not confirmed yet.

## Decisions

1. **Provider plug-in points.** One `Sender` per channel (`apps/api/src/delivery/senders.ts`). Connecting a
   provider means writing one small sender and its secret; nothing else changes. Channels today: `sms` and
   `email`. WhatsApp and app push are added as channels when confirmed.
2. **Who gets what** (`fan-out.ts`): urgent alerts (new emergency job, reminder, backup, on-call, life safety)
   go by **SMS and email**; resident and owner updates by email. A partner's SMS goes to its alert line
   (E6), its emails to the partner office (partner admins). On-call alerts go to this week's two rota people;
   **if the week has no rota, every JAD+ Admin is alerted** instead of nobody (logged). Building management
   has no contact details in JAD+ yet (console, phase C), so its alerts are flagged at once.
3. **No personal data in messages.** A message says the request reference and the kind of emergency
   ("Water leak"), never a name, address, phone or the resident's description: SMS and email pass through
   outside providers. The recipient opens JAD+ for details. The owner notice is the plan's exact text (E1);
   no message gives instructions (L3). Deliveries store neither address nor text: the address is decrypted
   and the text rendered at the moment of sending.
4. **Retries.** Urgent: after 1, 2, 5 and 10 minutes (5 tries in about 18 minutes). Other: after 5 min, 30 min,
   2 h and 12 h. Then the delivery fails for good.
5. **Nothing fails silently.** An alert none of whose deliveries went out is marked **undelivered**, audited,
   logged as an error and listed for JAD+ Admin (`GET /api/admin/notifications/undelivered`), who then calls
   by phone. While no provider is connected, every alert lands on that list: this is deliberate, so the gap
   is visible every day until providers are live.
6. **Every minute**, after the escalation sweep, so an escalation alert goes out in the same minute.
7. **On a developer machine** the alert text (no personal data) is printed instead of sent; the address never.

## Consequences

Alerts are still **not reaching anyone** until at least SMS and email providers are connected. That is the
last blocker before a real emergency can be handled. Sign-in codes will use the same email and SMS senders.
