/** Photos on requests (ADR 0013; CLAUDE.md "Uploads"): C-AZ-1, C-AZ-2, C-VAL-1, C-PD-1. */
import { requestDetailResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { leak, raise, world, type World } from './emergency-world.js';
import { jpegWithLocation } from './fixtures.js';

/** A tiny JPEG: SOI, APP0 (JFIF), APP1 (EXIF with a fake GPS marker), a minimal scan, EOI. */

async function requestId(w: World): Promise<string> {
  return (await (await raise(w, leak)).json<{ requestId: string }>()).requestId;
}

const upload = (w: World, id: string, body: Uint8Array, type = 'image/jpeg', token = w.tenantToken) =>
  w.h.request(`/api/requests/${id}/photos`, {
    method: 'POST',
    token,
    headers: { 'content-type': type },
    body,
  });

describe('request photos', () => {
  it('C-PD-1: a photo is stored without its location data and shown to people on the request', async () => {
    const w = await world();
    const id = await requestId(w);
    const res = await upload(w, id, jpegWithLocation());
    expect(res.status).toBe(201);
    const { id: photoId } = await res.json<{ id: string }>();

    const detail = requestDetailResponse.parse(
      await (await w.h.request(`/api/requests/${id}`, { token: w.ownerToken })).json(),
    );
    expect(detail.photos).toEqual([{ id: photoId }]);

    // The partner handling the job sees it; the stored file has no EXIF / GPS any more.
    const view = await w.h.request(`/api/requests/${id}/photos/${photoId}`, { token: w.primaryToken });
    expect(view.status).toBe(200);
    expect(view.headers.get('content-type')).toBe('image/jpeg');
    const stored = new Uint8Array(await view.arrayBuffer());
    const text = String.fromCharCode(...stored);
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('Exif');
    expect(text).toContain('JFIF');
    expect(stored.at(-2)).toBe(0xff);
    expect(stored.at(-1)).toBe(0xd9);
  });

  it('C-VAL-1: the type comes from the bytes and must match; not-images and broken files are refused', async () => {
    const w = await world();
    const id = await requestId(w);
    expect((await upload(w, id, jpegWithLocation(), 'image/png')).status).toBe(415);
    expect(
      (await upload(w, id, new TextEncoder().encode('<script>alert(1)</script>'), 'image/jpeg')).status,
    ).toBe(415);
    expect((await upload(w, id, Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x99, 0x99]))).status).toBe(415);
  });

  it('at most 3 photos per request', async () => {
    const w = await world();
    const id = await requestId(w);
    for (let i = 0; i < 3; i += 1) expect((await upload(w, id, jpegWithLocation())).status).toBe(201);
    expect((await upload(w, id, jpegWithLocation())).status).toBe(409);
  });

  it('C-AZ-2: the partner adds photos only of finished work; another partner can neither add nor see them', async () => {
    const w = await world();
    const id = await requestId(w);
    expect((await upload(w, id, jpegWithLocation(), 'image/jpeg', w.primaryToken)).status).toBe(409);
    expect((await upload(w, id, jpegWithLocation(), 'image/jpeg', w.backupToken)).status).toBe(404);
    const { id: photoId } = await (await upload(w, id, jpegWithLocation())).json<{ id: string }>();
    expect(
      (await w.h.request(`/api/requests/${id}/photos/${photoId}`, { token: w.backupToken })).status,
    ).toBe(404);
  });

  it('E10/ADR 0018: photos the partner adds while working show as finished-work photos', async () => {
    const w = await world();
    const id = await requestId(w);
    const post = (path: string, json: object) =>
      w.h.request(path, { method: 'POST', token: w.primaryToken, json });
    // The job is an emergency: acknowledged first (E4), then the work starts.
    await post(`/api/partner/jobs/${id}/acknowledge`, {
      technicianId: 't-primary',
      arrivalWindowStart: w.h.clock + 1_800_000,
      arrivalWindowEnd: w.h.clock + 3_600_000,
    });
    expect((await post(`/api/partner/jobs/${id}/start`, {})).status).toBe(200);
    expect((await upload(w, id, jpegWithLocation(), 'image/jpeg', w.primaryToken)).status).toBe(201);
    const detail = requestDetailResponse.parse(
      await (await w.h.request(`/api/requests/${id}`, { token: w.ownerToken })).json(),
    );
    expect(detail.completionPhotos).toHaveLength(1);
    expect(detail.photos).toHaveLength(0);
  });
});
