/** Audit actions for JAD+ Admin platform settings (ADR 0025). Each module owns its list; audit.ts joins them. */
export const ADMIN_PLATFORM_ACTIONS = [
  'service_partners_set',
  'provider_added',
  'service_listed_changed',
  'building_contact_added',
  'building_contact_removed',
  'building_contacts_viewed',
  'building_notice_published',
  'building_notice_withdrawn',
  'home_guide_section_saved',
  'home_guide_section_removed',
  'offer_interests_viewed',
  'offer_interest_handled',
  'holiday_added',
  'holiday_removed',
  'building_line_set',
  'building_line_removed',
] as const;
