# ADR 0020 — Emergency confirmation without "call 999"

Date: 10-Nov-2026 · Decided by: Naya ("in the message emergency is sent remove the if anyone is in danger
call…") · To review: Dr. Mohanad and legal (this changes the Master Plan's L3 text)

## Decision

After an emergency is reported, the app shows only:

> Your emergency has been sent to [provider].

The plan's second sentence, "If anyone is in danger, call 999.", is removed, in every language. L3's other
rule is unchanged: the app gives no instructions.

## Context

- With ADR 0017, JAD+ takes only water leaks and AC failures; fire, smoke, gas and injuries are not reported in
  JAD+ at all.
- The terms of use (draft for legal review) still say that JAD+ is not an emergency service and name 999,
  998 and 997.

## Consequences

BUILD_SPEC L3 is marked "changed by ADR 0020". If legal asks for the sentence back, it is one line in
`packages/shared/src/emergency.ts` plus the five translations in
`apps/mobile/src/i18n/strings/screens-requests.ts`.
