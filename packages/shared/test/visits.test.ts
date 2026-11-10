/** Preferred visit days and photo checks (ADR 0013). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CALENDAR } from '../src/calendar.js';
import { preferredDays, sniffPhotoType, stripPhotoMetadata } from '../src/visits.js';

const bytes = (...parts: (number[] | string)[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : p)));

describe('preferred visit days', () => {
  it('ADR 0013: ten working days from tomorrow, skipping weekends', () => {
    const days = preferredDays('2026-11-09', DEFAULT_CALENDAR); // a Monday
    expect(days).toHaveLength(10);
    expect(days[0]).toBe('2026-11-10');
    expect(days).not.toContain('2026-11-14'); // Saturday
    expect(days).not.toContain('2026-11-15'); // Sunday
    expect(days[4]).toBe('2026-11-16');
  });

  it('a Friday request starts on Monday', () => {
    expect(preferredDays('2026-11-13', DEFAULT_CALENDAR)[0]).toBe('2026-11-16');
  });
});

describe('photo checks', () => {
  const jpeg = bytes(
    [0xff, 0xd8],
    [0xff, 0xe0, 0x00, 0x07],
    'JFIF\0',
    [0xff, 0xe1, 0x00, 0x0b],
    'Exif\0\0GPS',
    [0xff, 0xfe, 0x00, 0x06],
    'note',
    [0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x55, 0xff, 0xd9],
  );

  it('the type is read from the bytes, never from a name', () => {
    expect(sniffPhotoType(jpeg)).toBe('image/jpeg');
    expect(sniffPhotoType(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe('image/png');
    expect(sniffPhotoType(bytes('GIF89a....'))).toBeNull();
    expect(sniffPhotoType(bytes('<svg>'))).toBeNull();
  });

  it('C-PD-1: JPEG location and comments are removed; the picture stays', () => {
    const clean = stripPhotoMetadata(jpeg, 'image/jpeg');
    const text = String.fromCharCode(...(clean ?? []));
    expect(text).toContain('JFIF');
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('note');
    expect(clean?.slice(-3)).toEqual(Uint8Array.from([0x55, 0xff, 0xd9]));
  });

  it('C-PD-1: PNG text and EXIF chunks are removed', () => {
    const chunk = (type: string, data: string) => bytes([0, 0, 0, data.length], type, data, [0, 0, 0, 0]);
    const png = Uint8Array.from([
      ...bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]),
      ...chunk('IHDR', 'abcdefghijklm'),
      ...chunk('tEXt', 'Location'),
      ...chunk('eXIf', 'GPS'),
      ...chunk('IDAT', 'pixels'),
      ...chunk('IEND', ''),
    ]);
    const text = String.fromCharCode(...(stripPhotoMetadata(png, 'image/png') ?? []));
    expect(text).toContain('IDAT');
    expect(text).not.toContain('Location');
    expect(text).not.toContain('GPS');
  });

  it('broken files are refused', () => {
    expect(stripPhotoMetadata(bytes([0xff, 0xd8, 0xff, 0xe1, 0x99, 0x99]), 'image/jpeg')).toBeNull();
    expect(
      stripPhotoMetadata(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 99]), 'image/png'),
    ).toBeNull();
  });
});
