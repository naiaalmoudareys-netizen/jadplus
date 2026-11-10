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
  preferencesResponse,
  inboxResponse,
  type Inbox,
  type MarkReadBody,
  type CloseRequestBody,
  type MakeSafeBody,
  type NoAccessBody,
  type ConsentBody,
  type Preferences,
  type PreferencesBody,
  meResponse,
  partnerJobsResponse,
  partnerTeamResponse,
  sessionResponse,
  type AcknowledgeEmergencyBody,
  type BookVisitBody,
  type QuoteDecisionBody,
  type RatingBody,
  type SendQuoteBody,
  type WorkDoneBody,
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
  details: Pick<RaiseRequestBody, 'serviceCode' | 'description' | 'preferredDate' | 'preferredSlot'>,
): Promise<RequestRaised> =>
  api.post(
    '/api/requests',
    {
      ...(place.tenancyId === null ? { sfUnitId: place.sfUnitId } : { tenancyId: place.tenancyId }),
      ...details,
    },
    requestRaisedResponse,
  );

/** ADR 0013: add a prepared JPEG photo to a request; answers with the new photo's id. */
export const addRequestPhoto = (
  api: ApiClient,
  requestId: string,
  jpeg: Uint8Array<ArrayBuffer>,
): Promise<{ id: string }> =>
  api.upload(
    `/api/requests/${encodeURIComponent(requestId)}/photos`,
    jpeg,
    'image/jpeg',
    z.object({ id: z.string() }),
  );

const job = (id: string, step: string): string => `/api/partner/jobs/${encodeURIComponent(id)}/${step}`;
const request = (id: string, step: string): string => `/api/requests/${encodeURIComponent(id)}/${step}`;

/** ADR 0018, partner: book (or change) the visit with a technician and a window. */
export const bookVisit = (api: ApiClient, jobId: string, body: BookVisitBody): Promise<unknown> =>
  api.post(job(jobId, 'visit'), body, z.unknown());

/** L4, A2, A3, partner: a quote for chargeable work (or the one revised quote after a decline). */
export const sendQuote = (api: ApiClient, jobId: string, body: SendQuoteBody): Promise<unknown> =>
  api.post(job(jobId, 'quote'), body, z.unknown());

/** Partner: the technician has started the work. */
export const startWork = (api: ApiClient, jobId: string): Promise<unknown> =>
  api.post(job(jobId, 'start'), {}, z.unknown());

/** E10, partner: the work is done (photos are uploaded before, with addRequestPhoto). */
export const workDone = (api: ApiClient, jobId: string, body: WorkDoneBody): Promise<unknown> =>
  api.post(job(jobId, 'done'), body, z.unknown());

/** L4, A3, owner: approve or decline the quote. */
export const decideQuote = (api: ApiClient, requestId: string, body: QuoteDecisionBody): Promise<unknown> =>
  api.post(request(requestId, 'quote-decision'), body, z.unknown());

/** E10, A5, owner or tenant: the work is done, or not yet (reopens with the same partner). */
export const confirmWork = (api: ApiClient, requestId: string, done: boolean): Promise<unknown> =>
  api.post(request(requestId, 'confirm'), { done }, z.unknown());

/** S5, owner or tenant: rate the job once it is closed. */
export const rateRequest = (api: ApiClient, requestId: string, body: RatingBody): Promise<unknown> =>
  api.post(request(requestId, 'rating'), body, z.unknown());

/** Profile settings and consents (ADR 0016). */
export const preferences = (api: ApiClient): Promise<Preferences> =>
  api.get('/api/me/preferences', preferencesResponse);

export const changePreferences = (api: ApiClient, body: PreferencesBody): Promise<Preferences> =>
  api.post('/api/me/preferences', body, preferencesResponse);

export const giveConsent = (api: ApiClient, body: ConsentBody): Promise<Preferences> =>
  api.post('/api/me/consents', body, preferencesResponse);

/** ADR 0019: the person's notifications (latest 50) and how many are unread. */
export const inbox = (api: ApiClient): Promise<Inbox> => api.get('/api/me/inbox', inboxResponse);

export const markInboxRead = (api: ApiClient, body: MarkReadBody): Promise<void> =>
  api.postNoContent('/api/me/inbox/read', body);

/** A8, partner: the technician is on the way to the booked visit. */
export const onMyWay = (api: ApiClient, jobId: string): Promise<unknown> =>
  api.post(job(jobId, 'on-my-way'), {}, z.unknown());

/** A7, partner: no one let the technician in (the door photo is uploaded first with addRequestPhoto). */
export const noAccess = (api: ApiClient, jobId: string, body: NoAccessBody): Promise<unknown> =>
  api.post(job(jobId, 'no-access'), body, z.unknown());

/** E8, partner: urgent make-safe work within the owner's limit (the API refuses anything above it). */
export const makeSafe = (api: ApiClient, jobId: string, body: MakeSafeBody): Promise<unknown> =>
  api.post(job(jobId, 'make-safe'), body, z.unknown());

/** Owner or tenant: cancel before the work starts, or (owner, E19) "I arranged it myself". */
export const closeRequest = (api: ApiClient, requestId: string, body: CloseRequestBody): Promise<unknown> =>
  api.post(request(requestId, 'close'), body, z.unknown());
