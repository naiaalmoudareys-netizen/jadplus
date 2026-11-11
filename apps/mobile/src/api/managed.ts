/**
 * Managed units, furnishing delivery dates and interior design stages (ADR 0034; O4, O5, S4): the owner's managed
 * units with their monthly statements, a request's delivery date and stages, and the provider setting the date.
 */
import {
  ownerManagedUnitsResponse,
  requestProjectResponse,
  type DeliveryBody,
  type OwnerManagedUnit,
  type RequestProject,
} from '@jadplus/shared';
import { z } from 'zod';
import type { ApiClient } from './client.js';

const part = (p: string): string => encodeURIComponent(p);

/** O4: the owner's managed units (current and past), each with its statements. */
export const ownerManagedUnits = async (api: ApiClient): Promise<OwnerManagedUnit[]> =>
  (await api.get('/api/owner/managed-units', ownerManagedUnitsResponse)).units;

/** Where a statement PDF is served (after the API's access check; every download is audited). */
export const statementFilePath = (managedUnitId: string, statementId: string): string =>
  `/api/managed-units/${part(managedUnitId)}/statements/${part(statementId)}/file`;

/** S4/O5: the delivery date (furnishing) and the stages (interior design) of a request. */
export const requestProject = (api: ApiClient, requestId: string): Promise<RequestProject> =>
  api.get(`/api/requests/${part(requestId)}/project`, requestProjectResponse);

/** S4: the provider sets or moves the delivery date (a reason when moving). */
export const setDelivery = (api: ApiClient, jobId: string, body: DeliveryBody): Promise<unknown> =>
  api.put(
    `/api/partner/jobs/${part(jobId)}/delivery`,
    body,
    z.object({ id: z.string(), date: z.string(), slot: z.string(), moved: z.boolean() }),
  );
