/** The API calls the app makes, one function each, with the shared request and answer schemas. */
import {
  codeSentResponse,
  emergencyRaisedResponse,
  messagePostedResponse,
  myPlacesResponse,
  myRequestsResponse,
  ownerPortalResponse,
  requestDetailResponse,
  requestRaisedResponse,
  servicesResponse,
  meResponse,
  partnerJobsResponse,
  partnerTeamResponse,
  sessionResponse,
  type AcknowledgeEmergencyBody,
  type DeskRequestBody,
  type EmergencyRaised,
  type MyPlace,
  type OwnerPortalAnswer,
  type RaiseEmergencyBody,
  type RaiseRequestBody,
  type RequestDetail,
  type RequestMessage,
  type RequestRaised,
  type RequestSummary,
  type MeResponse,
  type PartnerJob,
  type PartnerTeam,
  type RoleContextView,
  type ServiceView,
  type SessionResponse,
} from '@jadplus/shared';
import { z } from 'zod';
import type { ApiClient } from './client.js';

/** "Email or mobile number" as typed; the API normalises and validates it. */
export function identifierBody(typed: string): { email: string } | { phone: string } {
  const value = typed.trim();
  return value.includes('@') ? { email: value } : { phone: value };
}

export const requestCode = (api: ApiClient, typed: string): Promise<{ message: string }> =>
  api.post('/api/auth/code', identifierBody(typed), codeSentResponse);

export const verifyCode = (api: ApiClient, typed: string, code: string): Promise<SessionResponse> =>
  api.post(
    '/api/auth/verify',
    { ...identifierBody(typed), code: code.trim(), client: 'mobile' },
    sessionResponse,
  );

export const me = (api: ApiClient): Promise<MeResponse> => api.get('/api/auth/me', meResponse);

export const switchView = (api: ApiClient, to: RoleContextView): Promise<SessionResponse> =>
  api.post('/api/auth/switch', to, sessionResponse);

export const signOut = (api: ApiClient): Promise<void> => api.postNoContent('/api/auth/sign-out');

export const signOutEverywhere = (api: ApiClient): Promise<void> =>
  api.postNoContent('/api/auth/sign-out-everywhere');

export const partnerJobs = async (api: ApiClient): Promise<PartnerJob[]> =>
  (await api.get('/api/partner/jobs', partnerJobsResponse)).jobs;

export const partnerTeam = (api: ApiClient): Promise<PartnerTeam> =>
  api.get('/api/partner/team', partnerTeamResponse);

export const acknowledge = (
  api: ApiClient,
  jobId: string,
  body: AcknowledgeEmergencyBody,
): Promise<unknown> =>
  api.post(`/api/partner/jobs/${encodeURIComponent(jobId)}/acknowledge`, body, z.unknown());

export const myPlaces = async (api: ApiClient): Promise<MyPlace[]> =>
  (await api.get('/api/me/places', myPlacesResponse)).places;

export const myRequests = async (api: ApiClient): Promise<RequestSummary[]> =>
  (await api.get('/api/requests', myRequestsResponse)).requests;

export const requestDetail = (api: ApiClient, id: string): Promise<RequestDetail> =>
  api.get(`/api/requests/${encodeURIComponent(id)}`, requestDetailResponse);

export const postMessage = async (
  api: ApiClient,
  id: string,
  body: string,
): Promise<{ message: RequestMessage; masked: boolean }> =>
  api.post(`/api/requests/${encodeURIComponent(id)}/messages`, { body }, messagePostedResponse);

/** E1/E3: raise an emergency from a place the person may use (owner: unit; tenant: tenancy). */
export const raiseEmergency = (
  api: ApiClient,
  place: MyPlace,
  details: Pick<RaiseEmergencyBody, 'type' | 'faultSource' | 'description'>,
): Promise<EmergencyRaised> =>
  api.post(
    '/api/emergencies',
    {
      ...(place.tenancyId === null ? { sfUnitId: place.sfUnitId } : { tenancyId: place.tenancyId }),
      ...details,
    },
    emergencyRaisedResponse,
  );

/** R1/O1/N1: the owner's residence data (demo until Salesforce is connected, ADR 0010). */
export const ownerPortal = (api: ApiClient): Promise<OwnerPortalAnswer> =>
  api.get('/api/owner/portal', ownerPortalResponse);

/** N2: tell JAD+ the owner is interested in an exclusive offer. */
export const interestedInOffer = (api: ApiClient, postId: string): Promise<unknown> =>
  api.post(`/api/owner/offers/${encodeURIComponent(postId)}/interest`, {}, z.unknown());

/** ADR 0011: a request to the JAD+ desk (a document or an account change). */
export const deskRequest = (api: ApiClient, body: DeskRequestBody): Promise<unknown> =>
  api.post('/api/owner/desk-requests', body, z.unknown());

/** S1/S2: the service catalogue with who takes a request now. */
export const services = async (api: ApiClient): Promise<ServiceView[]> =>
  (await api.get('/api/services', servicesResponse)).services;

/** A routine request for one of the owner's units (ADR 0012). */
export const raiseRequest = (
  api: ApiClient,
  place: MyPlace,
  details: Pick<RaiseRequestBody, 'serviceCode' | 'description'>,
): Promise<RequestRaised> =>
  api.post(
    '/api/requests',
    {
      ...(place.tenancyId === null ? { sfUnitId: place.sfUnitId } : { tenancyId: place.tenancyId }),
      ...details,
    },
    requestRaisedResponse,
  );
