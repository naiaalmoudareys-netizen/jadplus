/**
 * The partner office's workspace (GET /api/partner/workspace, ADR 0036): its company, title, services and pages.
 * Loaded once per office view by the app, then read by the frame (menu, header) and the pages (eyebrows, what to
 * show). For JAD+ Admin there is none.
 */
import { partnerWorkspaceResponse, type PartnerWorkspace } from '@jadplus/shared';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Api } from '../lib/api';
import type { Session } from '../lib/session';

/** Loading, failed (the office can only try again), or the workspace. */
export type WorkspaceState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly workspace: PartnerWorkspace };

/** The office's workspace for the signed-in view; null for every other role. */
export function useWorkspaceLoad(api: Api, session: Session | null): WorkspaceState | null {
  const office = session?.role === 'partner_admin' ? (session.partnerId ?? '') : null;
  const [state, setState] = useState<WorkspaceState>({ status: 'loading' });
  useEffect(() => {
    setState({ status: 'loading' });
    if (office === null) return undefined;
    let current = true;
    api.get('/api/partner/workspace', partnerWorkspaceResponse).then(
      (workspace) => {
        if (current) setState({ status: 'ready', workspace });
      },
      () => {
        if (current) setState({ status: 'error' });
      },
    );
    return () => {
      current = false;
    };
  }, [api, office]);
  return office === null ? null : state;
}

const WorkspaceContext = createContext<PartnerWorkspace | null>(null);
export const WorkspaceProvider = WorkspaceContext.Provider;

/** The office's workspace, or null in JAD+ Admin. */
export function useWorkspace(): PartnerWorkspace | null {
  return useContext(WorkspaceContext);
}
