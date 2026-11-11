/** Flow B calls (ADR 0032; O3): the report side of a request, its snag list, and the owner's reports. */
import {
  ownerReportsResponse,
  requestReportResponse,
  snagChangedResponse,
  snagListResponse,
  type OwnerReport,
  type RequestReport,
  type SnagList,
} from '@jadplus/shared';
import { z } from 'zod';
import type { ApiClient } from './client.js';

const request = (id: string, ...parts: string[]): string =>
  `/api/requests/${[id, ...parts].map((p) => encodeURIComponent(p)).join('/')}`;

/** O3: the request's reports, the snagging choice, the L2 line and the owner's steps. */
export const requestReport = (api: ApiClient, id: string): Promise<RequestReport> =>
  api.get(request(id, 'report'), requestReportResponse);

/** Where a report PDF is served (after the API's access check; every download is audited). */
export const reportFilePath = (requestId: string, reportId: string): string =>
  request(requestId, 'report', reportId, 'file');

/** O3: every report on the owner's requests, for My unit → Documents. */
export const ownerReports = async (api: ApiClient): Promise<OwnerReport[]> =>
  (await api.get('/api/me/reports', ownerReportsResponse)).reports;

/** O3: the snag list of a snagging request. */
export const snagList = (api: ApiClient, id: string): Promise<SnagList> =>
  api.get(request(id, 'snags'), snagListResponse);

/** O3: the owner confirms a fixed snag, or reopens it. */
export const decideSnag = (api: ApiClient, id: string, snagId: string, confirm: boolean): Promise<unknown> =>
  api.post(request(id, 'snags', snagId, 'decision'), { confirm }, snagChangedResponse);

/** O3/S4: the owner asks for the one free re-inspection. */
export const askReinspection = (api: ApiClient, id: string): Promise<unknown> =>
  api.post(request(id, 'reinspection'), {}, z.object({ id: z.string(), status: z.string() }));

/** A snag photo ('snag') or the photo of its fix ('fix'), for an image with the session header. */
export const snagPhotoPath = (id: string, snagId: string, which: 'snag' | 'fix'): string =>
  request(id, 'snags', snagId, 'photo', which);
