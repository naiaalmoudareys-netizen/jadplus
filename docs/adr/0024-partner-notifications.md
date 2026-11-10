# ADR 0024 — Notifications for partners, and for new messages

Date: 10-Nov-2026 · Decided by: Naya ("I see no notifications for the technician on his phone when he should be
getting notifications"), details by Claude · To review: Naya

## Decision

The in-app inbox (ADR 0019) now also serves partners. Partner items go to the technician assigned to the job,
or to every active technician of the partner while nobody is assigned, and always to the partner's office
(partner_admin). They are written in the same batch as the change they describe (migration 0018 adds the kinds).

| Kind                | When                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| job_new             | A job reaches the partner (urgent for an emergency, E1, R3)                            |
| job_reminder        | An emergency not acknowledged after 15 minutes (E5)                                    |
| job_moved_away      | The emergency went to the backup partner (E6)                                          |
| job_assigned_to_you | The office chose this technician (to that technician only)                             |
| quote_approved      | The owner approved the quote (L4)                                                      |
| quote_declined      | The owner declined; one revised quote may follow (A3)                                  |
| work_confirmed      | The resident confirmed the work (E10)                                                  |
| work_reopened       | The resident says it is not done (A5)                                                  |
| job_rated           | The resident rated the job (S5)                                                        |
| job_cancelled       | The resident cancelled, or the owner arranged it themselves                            |
| message_received    | A new message on the request: to everyone else on it, never the writer (residents too) |

Access stays as it is: a partner sees items only for jobs it has, except "moved to the backup partner", which
carries only the reference and stays visible to the first partner although the job is no longer theirs.

When providers are connected (phase E), the same items go out by push, SMS or WhatsApp; the existing outbox
alerts for emergencies (ADR 0007) stay as they are.
