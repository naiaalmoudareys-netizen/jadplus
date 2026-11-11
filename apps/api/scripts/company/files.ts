/**
 * Small, valid, obviously fictional files for the demo company: PNG "photos" (a plain colour block, no camera
 * data, no location) and one-page SAMPLE PDFs (reports, statements, partner documents).
 */
import { crc32, deflateSync } from 'node:zlib';
import { samplePdf } from '../../src/portal/sample-pdf.js';

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A 96 x 72 PNG: a soft vertical gradient of the given colour, like a blurred photo of a wall or a fitting. */
export function demoPhoto(rgb: readonly [number, number, number]): Uint8Array<ArrayBuffer> {
  const width = 96;
  const height = 72;
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    const shade = 0.75 + (0.25 * y) / height;
    for (let x = 0; x < width; x += 1) {
      const at = row + 1 + x * 3;
      raw[at] = Math.round(rgb[0] * shade);
      raw[at + 1] = Math.round(rgb[1] * shade);
      raw[at + 2] = Math.round(rgb[2] * shade);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export const PHOTO_COLOURS: readonly (readonly [number, number, number])[] = [
  [214, 204, 186],
  [176, 190, 197],
  [200, 180, 150],
  [160, 170, 160],
  [225, 215, 200],
];

/** A one-page PDF titled `title`, marked SAMPLE (src/portal/sample-pdf.ts). */
export function demoPdf(title: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(samplePdf(title));
}
