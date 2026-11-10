/**
 * When the owner would like the visit, and the photos they add to a request (ADR 0013).
 *
 * Preferred visit: a working day (Mon-Fri, UAE holidays off, the plan's calendar) in the next two weeks, and
 * a time window inside working hours. The partner sees it and books the visit (A8 reminders follow).
 *
 * Photos: up to 3 per request, JPEG or PNG, at most 10 MB. The phone re-encodes every photo (which drops the
 * camera's location data) and the server checks the file really is that image type and removes any remaining
 * metadata (location, camera details, comments) before storing it privately (CLAUDE.md "Uploads").
 */
import { dubaiDate, isWorkingTime, type WorkingCalendar } from './calendar.js';

export const VISIT_SLOTS = [
  { key: 'morning', label: 'Morning', hours: '9:00 - 12:00' },
  { key: 'midday', label: 'Midday', hours: '12:00 - 15:00' },
  { key: 'afternoon', label: 'Afternoon', hours: '15:00 - 18:00' },
] as const;
export type VisitSlot = (typeof VISIT_SLOTS)[number]['key'];
export const VISIT_SLOT_KEYS = VISIT_SLOTS.map((s) => s.key) as [VisitSlot, ...VisitSlot[]];

/** How many working days ahead the owner can choose from (about two weeks). */
export const PREFERRED_DAYS = 10;

const DAY_MS = 86_400_000;
/** 10:00 Dubai (06:00 UTC) on a day: inside working hours whenever the day itself is a working day. */
const MID_MORNING_UTC_MS = 6 * 3_600_000;

/** The working days the owner can pick, starting tomorrow (Dubai dates, YYYY-MM-DD). */
export function preferredDays(today: string, cal: WorkingCalendar, count = PREFERRED_DAYS): string[] {
  const days: string[] = [];
  let t = Date.parse(`${today}T00:00:00Z`) + DAY_MS;
  for (let i = 0; days.length < count && i < count * 4; i += 1, t += DAY_MS) {
    if (isWorkingTime(t + MID_MORNING_UTC_MS, cal)) days.push(dubaiDate(t + MID_MORNING_UTC_MS));
  }
  return days;
}

export const MAX_REQUEST_PHOTOS = 3;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export type PhotoType = 'image/jpeg' | 'image/png';

/** The image type from the file's first bytes (never from its name or the sender's claim). */
export function sniffPhotoType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > 8 && png.every((b, i) => bytes[i] === b)) return 'image/png';
  return null;
}

/**
 * JPEG without its metadata: drops APP1-APP15 segments (EXIF incl. GPS location, XMP, IPTC) and comments,
 * keeping APP0 (JFIF) and the image itself. Returns null if the file is not a well-formed JPEG.
 */
function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1] ?? 0;
    // Start of scan: the compressed image follows to the end of the file; copy the rest as it is.
    if (marker === 0xda) {
      for (let k = i; k < bytes.length; k += 1) out.push(bytes[k] ?? 0);
      return Uint8Array.from(out);
    }
    const length = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
    if (length < 2 || i + 2 + length > bytes.length) return null;
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) for (let k = i; k < i + 2 + length; k += 1) out.push(bytes[k] ?? 0);
    i += 2 + length;
  }
  return null;
}

/** PNG without text and EXIF chunks (tEXt, zTXt, iTXt, eXIf, tIME). Returns null if not a well-formed PNG. */
function stripPng(bytes: Uint8Array): Uint8Array | null {
  const drop = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
  const out: number[] = Array.from(bytes.subarray(0, 8));
  let i = 8;
  while (i + 12 <= bytes.length) {
    const length =
      (((bytes[i] ?? 0) << 24) |
        ((bytes[i + 1] ?? 0) << 16) |
        ((bytes[i + 2] ?? 0) << 8) |
        (bytes[i + 3] ?? 0)) >>>
      0;
    const end = i + 12 + length;
    if (end > bytes.length) return null;
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    if (!drop.has(type)) for (let k = i; k < end; k += 1) out.push(bytes[k] ?? 0);
    i = end;
    if (type === 'IEND') return Uint8Array.from(out);
  }
  return null;
}

/** The photo without metadata, or null when it is not a valid photo of the claimed type. */
export function stripPhotoMetadata(bytes: Uint8Array, type: PhotoType): Uint8Array | null {
  return type === 'image/jpeg' ? stripJpeg(bytes) : stripPng(bytes);
}
