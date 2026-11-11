/**
 * Photos the partner office adds from the console (ADR 0018, 0025; E10, C-UPL-1): finished-work photos while
 * the work is in progress or waiting for the resident's confirmation. The console checks the obvious (JPEG or
 * PNG, up to 10 MB, up to 3 per request) before sending; the API checks again from the file's own bytes and
 * removes location and camera data before storing it, so nothing here is trusted for safety.
 */
import { MAX_REQUEST_PHOTOS, PHOTO_MAX_BYTES, type Status } from '@jadplus/shared';

export const PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/png'];

/** The API files a partner's photo as finished work in these statuses (in "scheduled" it is a no-access photo). */
const COMPLETION_STATUSES: ReadonlySet<Status> = new Set<Status>(['in_progress', 'completed']);

/** How many more finished-work photos the job can take now; 0 when none may be added. */
export function completionPhotoSlots(status: Status, canAct: boolean, existing: number): number {
  if (!canAct || !COMPLETION_STATUSES.has(status)) return 0;
  return Math.max(0, MAX_REQUEST_PHOTOS - existing);
}

/** Why the chosen files cannot be sent, or null when they can. */
export function photoProblem(
  files: readonly { readonly type: string; readonly size: number }[],
  slots: number,
): string | null {
  if (files.length === 0) return 'Choose a photo first.';
  if (files.length > slots) {
    return slots === 1
      ? 'Only 1 more photo can be added.'
      : `Only ${String(slots)} more photos can be added.`;
  }
  if (files.some((f) => !PHOTO_TYPES.includes(f.type))) return 'Photos must be JPEG or PNG.';
  if (files.some((f) => f.size === 0 || f.size > PHOTO_MAX_BYTES)) return 'Each photo can be up to 10 MB.';
  return null;
}
