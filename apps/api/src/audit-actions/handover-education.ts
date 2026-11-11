/** Audit actions for the handover checklist and investor education (ADR 0033). audit.ts joins every list. */
export const HANDOVER_EDUCATION_ACTIONS = [
  'handover_started',
  'handover_step_changed',
  'handover_appointment_set',
  'education_session_created',
  'education_session_changed',
  'education_session_cancelled',
  'education_bookings_viewed',
  'education_attendance_marked',
  'education_seat_booked',
  'education_seat_cancelled',
  'education_book_requested',
  'education_book_requests_viewed',
  'education_book_sent',
] as const;
