/**
 * The owner's residence data, loaded once for all owner tabs (Home, My unit, Payments, News, Progress) and
 * refreshed on demand. Also remembers which unit is selected when the owner has more than one (DESIGN.md).
 */
import type { OwnerPortalAnswer } from '@jadplus/shared';
import { createContext, use, useCallback, useState, type ReactNode } from 'react';
import { ownerPortal } from '../api/endpoints.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad, type Loaded } from '../ui/hooks.js';

interface PortalState extends Loaded<OwnerPortalAnswer> {
  readonly dealIndex: number;
  readonly setDealIndex: (i: number) => void;
}

const PortalContext = createContext<PortalState | null>(null);

export function PortalProvider({ children }: { children: ReactNode }): ReactNode {
  const { api } = useSessionController();
  const load = useCallback(() => ownerPortal(api), [api]);
  const loaded = useLoad(load);
  const [dealIndex, setDealIndex] = useState(0);
  return <PortalContext value={{ ...loaded, dealIndex, setDealIndex }}>{children}</PortalContext>;
}

export function usePortal(): PortalState {
  const state = use(PortalContext);
  if (state === null) throw new Error('usePortal must be used inside PortalProvider');
  return state;
}

/** For screens shared by owners and tenants: null when no owner data is loaded (tenants). */
export function usePortalOptional(): PortalState | null {
  return use(PortalContext);
}
