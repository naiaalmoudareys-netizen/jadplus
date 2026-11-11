/** Consultation calls (ADR 0031): ask for one, and follow it. Answers are checked with the shared schemas. */
import {
  consultationProviderResponse,
  consultationRaisedResponse,
  consultationResponse,
  type ConsultationProvider,
  type ConsultationRaised,
  type ConsultationView,
  type RaiseConsultationBody,
} from '@jadplus/shared';
import type { ApiClient } from './client.js';

/** O5: an owner asks for a consultation for one of their units (consent included in the body). */
export const raiseConsultation = (api: ApiClient, body: RaiseConsultationBody): Promise<ConsultationRaised> =>
  api.post('/api/consultations', body, consultationRaisedResponse);

/** The consultation on a request, or null when the request is not one. */
export const consultationOf = async (api: ApiClient, requestId: string): Promise<ConsultationView | null> =>
  (await api.get(`/api/requests/${encodeURIComponent(requestId)}/consultation`, consultationResponse))
    .consultation;

/** Who would get the owner's details for this service now (named in the consent), or null ("coming soon"). */
export const consultationProvider = async (
  api: ApiClient,
  serviceCode: string,
): Promise<ConsultationProvider> =>
  (
    await api.get(
      `/api/consultations/provider/${encodeURIComponent(serviceCode)}`,
      consultationProviderResponse,
    )
  ).provider;
