/**
 * The signed-in state of the app (C-SES-1, T3), as plain TypeScript so it can be tested without a phone.
 * The session token lives only in the TokenStore (the phone's secure storage, never plain storage) and in
 * memory. A token the API rejects is wiped at once and the app returns to sign-in.
 */
import type { MeResponse, RoleContextView } from '@jadplus/shared';
import { ApiError, type ApiClient } from '../api/client.js';
import * as endpoints from '../api/endpoints.js';

export interface TokenStore {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}

export type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed_out' }
  /** A token is stored but JAD+ could not be reached to check it; the app offers "Try again". */
  | { readonly status: 'offline' }
  | { readonly status: 'signed_in'; readonly me: MeResponse };

export type ApiFactory = (token: () => string | null, onUnauthorized: () => void) => ApiClient;

export class SessionController {
  private token: string | null = null;
  private current: SessionState = { status: 'loading' };
  private readonly listeners = new Set<(s: SessionState) => void>();
  readonly api: ApiClient;

  constructor(
    private readonly store: TokenStore,
    makeApi: ApiFactory,
  ) {
    this.api = makeApi(
      () => this.token,
      () => void this.forget(),
    );
  }

  get state(): SessionState {
    return this.current;
  }

  subscribe(listener: (s: SessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(next: SessionState): void {
    this.current = next;
    for (const l of this.listeners) l(next);
  }

  private async forget(): Promise<void> {
    this.token = null;
    await this.store.clear();
    this.set({ status: 'signed_out' });
  }

  private async load(): Promise<void> {
    try {
      this.set({ status: 'signed_in', me: await endpoints.me(this.api) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) this.set({ status: 'offline' });
      else await this.forget();
    }
  }

  /** On app start: resume a stored session if the API still accepts it. */
  async restore(): Promise<void> {
    this.token = await this.store.read();
    if (this.token === null) this.set({ status: 'signed_out' });
    else await this.load();
  }

  requestCode(typed: string): Promise<{ message: string }> {
    return endpoints.requestCode(this.api, typed);
  }

  async verify(typed: string, code: string): Promise<void> {
    const session = await endpoints.verifyCode(this.api, typed, code);
    await this.adopt(session.token);
  }

  /** R5/U7: move to another view; the API issues a new token for it (rotated on privilege change). */
  async switchTo(context: RoleContextView): Promise<void> {
    const session = await endpoints.switchView(this.api, context);
    await this.adopt(session.token);
  }

  private async adopt(token: string): Promise<void> {
    await this.store.write(token);
    this.token = token;
    await this.load();
  }

  /** Signs out here, or on every device (T3 lost phone). The phone forgets the token even if offline. */
  async signOut(everywhere = false): Promise<void> {
    try {
      if (everywhere) await endpoints.signOutEverywhere(this.api);
      else await endpoints.signOut(this.api);
    } finally {
      await this.forget();
    }
  }
}
