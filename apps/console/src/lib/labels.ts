/**
 * Plain English names for the codes the API uses (staff screens are English only, ADR 0025), and the colour
 * each state reads in (docs/DESIGN.md tone families). A code the console does not know yet falls back to a
 * readable version of itself, never to nothing.
 */
import type {
  BuildingLineKind,
  DeskStatus,
  GuideSection,
  NoticeKind,
  PartnerDocumentKind,
  SlaMetric,
  Skill,
} from '@jadplus/shared';
import { SERVICES } from '@jadplus/shared';
import { humanize, type Tone } from './format';

export const SKILL_LABELS: Readonly<Record<Skill, string>> = {
  ac: 'Air conditioning',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  carpentry: 'Carpentry and locks',
  painting: 'Painting',
  appliances: 'Appliances',
  general: 'General handyman',
};

export const UNAVAILABLE_LABELS: Readonly<Record<'leave' | 'sick' | 'training' | 'other', string>> = {
  leave: 'On leave',
  sick: 'Sick',
  training: 'Training',
  other: 'Away',
};

export const DOCUMENT_KIND_LABELS: Readonly<Record<PartnerDocumentKind, string>> = {
  trade_licence: 'Trade licence',
  insurance: 'Insurance',
  signed_sop_sla_kpi: 'Signed SOP, SLA and KPIs',
  rate_card: 'Signed rate card',
};

export const RATE_UNIT_LABELS: Readonly<Record<string, string>> = {
  per_job: 'per job',
  per_hour: 'per hour',
  per_visit: 'per visit',
  per_item: 'per item',
  per_sqm: 'per m²',
  per_metre: 'per metre',
  per_day: 'per day',
};

export const NOTICE_KIND_LABELS: Readonly<Record<NoticeKind, string>> = {
  water: 'Water',
  power: 'Power',
  lift: 'Lift',
  ac: 'Air conditioning',
  works: 'Works',
  other: 'Other',
};

export const GUIDE_SECTION_LABELS: Readonly<Record<GuideSection, string>> = {
  ac: 'Air conditioning',
  water: 'Water',
  waste: 'Waste and recycling',
  parking: 'Parking',
  access: 'Access and keys',
  amenities: 'Amenities',
  other: 'Other',
};

/** E12 (ADR 0029): the building help lines residents may call, and what each is for. */
export const BUILDING_LINE_LABELS: Readonly<Record<BuildingLineKind, { name: string; scope: string }>> = {
  security: { name: 'Security', scope: 'Noise, parking, access, visitors' },
  management: { name: 'Building management', scope: 'Common areas, lifts, shared pipes, building-wide AC' },
};

export const SLA_METRIC_LABELS: Readonly<Record<SlaMetric, string>> = {
  emergency_ack: 'Emergency acknowledged',
  emergency_on_site: 'Emergency on site',
  routine_response: 'Routine request answered',
  routine_visit: 'Routine visit',
  quote_after_visit: 'Quote after the visit',
  service_milestone: 'Service milestone',
};

export const ROLE_LABELS: Readonly<Record<string, string>> = {
  owner: 'Owner',
  tenant: 'Tenant',
  partner: 'Technician',
  partner_admin: 'Partner office',
  jad_admin: 'JAD+ Admin',
  jad_viewer: 'JAD+ viewer (read only)',
  system: 'JAD+ (automatic)',
};

export const DESK_TONES: Readonly<Record<DeskStatus, Tone>> = {
  New: 'warn',
  'In progress': 'calm',
  Completed: 'good',
  Cancelled: 'calm',
};

/** Where a partner document, a rate-card change or an upload stands. */
export const DECISION_LABELS: Readonly<Record<'pending' | 'accepted' | 'rejected', [string, Tone]>> = {
  pending: ['Waiting for JAD+', 'warn'],
  accepted: ['Accepted', 'good'],
  rejected: ['Rejected', 'bad'],
};

/** S7: a document on file, expiring within 30 days, lapsed or missing. */
export const STANDING_LABELS: Readonly<
  Record<'valid' | 'expiring_soon' | 'lapsed' | 'missing', [string, Tone]>
> = {
  valid: ['Valid', 'good'],
  expiring_soon: ['Expires within 30 days', 'warn'],
  lapsed: ['Expired', 'bad'],
  missing: ['Not on file', 'bad'],
};

export const ACCOUNT_LABELS: Readonly<Record<'active' | 'frozen' | 'closed', [string, Tone]>> = {
  active: ['Active', 'good'],
  frozen: ['Frozen', 'bad'],
  closed: ['Closed', 'calm'],
};

/** What happened on a request, as the timeline shows it. */
const EVENT_LABELS: Readonly<Record<string, string>> = {
  created: 'Raised',
  assigned: 'Sent to the partner',
  acknowledged: 'Emergency acknowledged',
  status_changed: 'Status changed',
  visit_booked: 'Visit booked',
  on_my_way: 'Technician on the way',
  no_access: 'No access at the door',
  quote_sent: 'Quote sent',
  quote_decided: 'Owner decided on the quote',
  attachment_added: 'Photo added',
  message_posted: 'Message',
  escalated: 'Moved to the backup partner',
  reassigned: 'Moved to another partner by JAD+',
  reclassified: 'Reclassified as routine by JAD+',
  cancelled: 'Cancelled',
  note_added: 'Internal note',
  owner_called: 'Owner called by JAD+',
};

export function eventLabel(kind: string): string {
  return EVENT_LABELS[kind] ?? humanize(kind);
}

export const NOTE_KIND_LABELS: Readonly<Record<string, string>> = {
  note: 'Note',
  owner_called: 'Owner called',
  reassigned: 'Moved to another partner',
  reclassified: 'Reclassified',
  cancelled: 'Cancelled',
  handled_by_jad: 'Handled by JAD+',
};

export function label<K extends string>(labels: Readonly<Partial<Record<K, string>>>, code: K): string {
  return labels[code] ?? humanize(code);
}

/** "Maintenance" for "maintenance": the service's name from the catalogue, or a readable code. */
export function serviceName(code: string): string {
  return SERVICES.find((s) => s.code === code)?.name ?? humanize(code);
}
