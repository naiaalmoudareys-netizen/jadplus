/**
 * Choosing who goes (E4, E17): only this partner's active technicians, with the signed-in technician chosen
 * first. Used when acknowledging an emergency and when booking a visit (ADR 0018).
 */
import type { PartnerTeam } from '@jadplus/shared';
import { useCallback, useState } from 'react';
import { partnerTeam } from '../api/endpoints.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad, type Loaded } from '../ui/hooks.js';

export interface TechnicianChoice {
  readonly team: Loaded<PartnerTeam>;
  readonly technicians: PartnerTeam['technicians'];
  /** The chosen technician: the person's own choice, else themselves, else the first one. */
  readonly technicianId: string | null;
  readonly choose: (id: string) => void;
}

export function useTechnicians(): TechnicianChoice {
  const { api } = useSessionController();
  const loadTeam = useCallback(() => partnerTeam(api), [api]);
  const team = useLoad(loadTeam);
  const [chosen, setChosen] = useState<string | null>(null);
  const technicians = team.data?.technicians ?? [];
  const technicianId = chosen ?? technicians.find((tech) => tech.self)?.id ?? technicians[0]?.id ?? null;
  return { team, technicians, technicianId, choose: setChosen };
}
