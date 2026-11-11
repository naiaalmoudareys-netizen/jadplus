/** The API call for "Your handover" (O2; ADR 0033), with the shared answer schema. */
import { ownerHandoversResponse, type HandoverChecklist } from '@jadplus/shared';
import type { ApiClient } from '../api/client.js';

export const myHandovers = async (api: ApiClient): Promise<HandoverChecklist[]> =>
  (await api.get('/api/me/handovers', ownerHandoversResponse)).handovers;
