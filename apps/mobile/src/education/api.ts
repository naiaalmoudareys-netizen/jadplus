/** The API calls for Investor Education (O5; ADR 0033), with the shared answer schemas. */
import { educationChangedResponse, ownerEducationResponse, type OwnerEducation } from '@jadplus/shared';
import type { ApiClient } from '../api/client.js';

const sessionPath = (id: string): string => `/api/education/sessions/${encodeURIComponent(id)}/seat`;

export const education = (api: ApiClient): Promise<OwnerEducation> =>
  api.get('/api/education', ownerEducationResponse);

export const reserveSeat = (api: ApiClient, sessionId: string): Promise<unknown> =>
  api.post(sessionPath(sessionId), {}, educationChangedResponse);

export const giveBackSeat = (api: ApiClient, sessionId: string): Promise<unknown> =>
  api.post(`${sessionPath(sessionId)}/cancel`, {}, educationChangedResponse);

export const askForBook = (api: ApiClient): Promise<unknown> =>
  api.post('/api/education/book', {}, educationChangedResponse);
