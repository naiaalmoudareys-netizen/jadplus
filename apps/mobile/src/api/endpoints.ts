/** The API calls the app makes, one function each, with the shared request and answer schemas. */
import {
  codeSentResponse,
  meResponse,
  partnerJobsResponse,
  partnerTeamResponse,
  sessionResponse,
  type AcknowledgeEmergencyBody,
  type MeResponse,
  type PartnerJob,
  type PartnerTeam,
  type RoleContextView,
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
