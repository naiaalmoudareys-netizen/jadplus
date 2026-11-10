/** Small test files shared by the photo tests. */

/** A minimal JPEG carrying a fake GPS comment in its metadata, which the API must strip (ADR 0013). */
export function jpegWithLocation(): Uint8Array {
  const app0 = [
    0xff,
    0xe0,
    0x00,
    0x10,
    ...Array.from('JFIF\0', (c) => c.charCodeAt(0)),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
  ];
  const exifText = Array.from('Exif\0\0GPS 25.2048N 55.2708E', (c) => c.charCodeAt(0));
  const app1 = [0xff, 0xe1, 0x00, exifText.length + 2, ...exifText];
  const sos = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0xd9];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...app1, ...sos]);
}
