/**
 * Building help lines (E12; ADR 0029). Two numbers residents may call directly about their building: the
 * building's security desk (noise, parking, access, visitors) and building management (common areas, lifts,
 * shared pipes, building-wide AC). Kept per building, or per project as the default for its buildings.
 *
 * A deliberate exception to "all contact goes through JAD+" (ADR 0009): building security and management are not
 * JAD+ partners, and Naya asked for direct calling (11-Nov-2026). These are service lines, not personal data,
 * but they are stored encrypted like every phone field (C-PD-2) and never logged.
 */
import { z } from 'zod';
import { placeCovers, placeFields, placeView, plainText, type Place } from './admin-platform.js';
import { dispatchFor, type FaultSource } from './emergency.js';
import { normalisePhone } from './owners.js';

/** The two lines, in the order the app shows them. Mirrors the CHECK list in migration 0026. */
export const BUILDING_LINE_KINDS = ['security', 'management'] as const;
export type BuildingLineKind = (typeof BUILDING_LINE_KINDS)[number];

/** "24/7", "Sun-Thu 8:00-17:00": short, written by JAD+ Admin. */
export const LINE_HOURS_MAX = 60;

/**
 * A building line's number in E.164 (+971…), or a UAE 800 / 600 service number as dialled, or null. Accepts what
 * normalisePhone accepts (international and UAE mobiles) and UAE landlines written locally ("04 000 0000" →
 * +97140000000).
 */
export function normaliseLinePhone(raw: string): string | null {
  const phone = normalisePhone(raw);
  if (phone !== null) return phone;
  const trimmed = raw.trim();
  if (!/^[\d\s().-]{6,25}$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  // UAE toll-free (800 …) and shared-cost (600 …) numbers, common for building services: kept as dialled.
  if (/^(800\d{3,8}|600\d{6})$/.test(digits)) return digits;
  return /^0[2-9]\d{7}$/.test(digits) ? `+971${digits.slice(1)}` : null;
}

/**
 * The phone's dialler link, only for a number in E.164 or a UAE 800 / 600 service number (nothing else is ever put
 * in a tel: link).
 */
export function telHref(phone: string): string | null {
  return /^(\+[1-9]\d{7,14}|800\d{3,8}|600\d{6})$/.test(phone) ? `tel:${phone}` : null;
}

/**
 * E12: whether a fault comes from outside the resident's home, so the building is responsible and the app shows
 * its help lines. Exactly the sources for which building management is alerted (dispatchFor).
 */
export function comesFromOutsideHome(source: FaultSource): boolean {
  return dispatchFor(source).buildingFm;
}

/**
 * The lines residents of `unit` see: per kind, the building's own line, else the project-wide one, else null.
 */
export function linesFor<L extends Place & { readonly kind: BuildingLineKind }>(
  lines: readonly L[],
  unit: Place,
): Record<BuildingLineKind, L | null> {
  const pick = (kind: BuildingLineKind): L | null => {
    const options = lines.filter((l) => l.kind === kind && placeCovers(l, unit));
    return options.find((l) => l.building !== null) ?? options[0] ?? null;
  };
  return { security: pick('security'), management: pick('management') };
}

// ---- Payloads (strict: unknown keys rejected, C-VAL-1) ----

export const linePhoneSchema = z
  .string()
  .max(25)
  .transform((raw, ctx) => {
    const phone = normaliseLinePhone(raw);
    if (phone === null) {
      ctx.addIssue({ code: 'custom', message: 'Enter a phone number, for example +971 4 000 0000.' });
      return z.NEVER;
    }
    return phone;
  });

/** PUT /api/admin/building-lines: set or change one line of a project or building. */
export const buildingLineBody = z.strictObject({
  ...placeFields,
  kind: z.enum(BUILDING_LINE_KINDS),
  phone: linePhoneSchema,
  hours: plainText(LINE_HOURS_MAX).nullable(),
});
export type BuildingLineBody = z.infer<typeof buildingLineBody>;

/** GET /api/admin/building-lines?project=: the lines of a project and its buildings. */
export const adminBuildingLinesResponse = z.object({
  lines: z.array(
    z.object({
      id: z.string(),
      ...placeView,
      kind: z.enum(BUILDING_LINE_KINDS),
      phone: z.string(),
      hours: z.string().nullable(),
      updatedAt: z.number(),
    }),
  ),
});
export type AdminBuildingLines = z.infer<typeof adminBuildingLinesResponse>;

const residentLine = z.object({ phone: z.string(), hours: z.string().nullable() });
export type ResidentLine = z.infer<typeof residentLine>;

/** GET /api/me/building-lines: per place of the resident's homes, the two lines (building's own or project's). */
export const residentBuildingLinesResponse = z.object({
  places: z.array(
    z.object({
      ...placeView,
      security: residentLine.nullable(),
      management: residentLine.nullable(),
    }),
  ),
});
export type ResidentBuildingLines = z.infer<typeof residentBuildingLinesResponse>;
