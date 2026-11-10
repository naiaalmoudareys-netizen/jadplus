/**
 * The console's only way to the JAD+ API (ADR 0022, C-VAL-1, C-WEB-2).
 *
 * - Same-origin only: the session is an HttpOnly cookie the page never sees; `credentials: 'same-origin'`.
 * - Every change (anything but GET) carries the anti-forgery token in the x-jadplus-csrf header.
 * - Every answer is checked with a zod schema before a screen uses it.
 * - A 401 on a signed-in call means the session ended: the app goes back to sign-in.
 * - Error messages written by the API for people are shown as given; nothing else is.
 */
import { errorResponse } from '@jadplus/shared';
import type { ZodType } from 'zod';

export const CSRF_HEADER = 'x-jadplus-csrf';
export const OFFLINE_MESSAGE = 'The JAD+ service could not be reached. Check the connection and try again.';
export const UNEXPECTED_MESSAGE = 'The JAD+ service answered in an unexpected way. Please try again.';
export const SIGNED_OUT_MESSAGE = 'Your session has ended. Please sign in again.';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The session ended (signed out elsewhere, idle for 30 minutes, or 12 hours passed). */
export class SignedOutError extends ApiError {
  constructor() {
    super(SIGNED_OUT_MESSAGE, 401);
    this.name = 'SignedOutError';
  }
}

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiOptions {
  readonly fetch: Fetch;
  /** The current anti-forgery token, or null before sign-in. */
  readonly csrf: () => string | null;
  /** Called once when a signed-in call answers 401. */
  readonly onSignedOut: () => void;
}

export interface CallOptions {
  /** False for the sign-in calls themselves, where 401 means "wrong code", not "session ended". */
  readonly signedIn?: boolean;
}

/** "/api/requests/abc/photos/def": every part is encoded, so an id can never change the path. */
export function apiPath(...parts: readonly string[]): string {
  return `/api/${parts.map((p) => encodeURIComponent(p)).join('/')}`;
}

/** The address of a request photo, for an <img> (GET with the cookie; no token needed). */
export function photoUrl(requestId: string, photoId: string): string {
  return apiPath('requests', requestId, 'photos', photoId);
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export class Api {
  constructor(private readonly options: ApiOptions) {}

  async get<T>(path: string, schema: ZodType<T>, call: CallOptions = {}): Promise<T> {
    return parse(await this.send('GET', path, undefined, call), schema);
  }

  async post<T>(path: string, body: unknown, schema: ZodType<T>, call: CallOptions = {}): Promise<T> {
    return parse(await this.send('POST', path, body, call), schema);
  }

  /** A change whose answer carries nothing the console needs (e.g. 204 on sign-out). */
  async postOnly(path: string, body?: unknown, call: CallOptions = {}): Promise<void> {
    await this.send('POST', path, body, call);
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    call: CallOptions,
  ): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const csrf = this.options.csrf();
    if (method !== 'GET' && csrf !== null) headers[CSRF_HEADER] = csrf;
    let res: Response;
    try {
      res = await this.options.fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiError(OFFLINE_MESSAGE, 0);
    }
    if (res.status === 401 && call.signedIn !== false) {
      this.options.onSignedOut();
      throw new SignedOutError();
    }
    if (!res.ok) {
      const error = errorResponse.safeParse(await readJson(res));
      throw new ApiError(
        error.success ? error.data.error : `Something went wrong (${res.status}). Please try again.`,
        res.status,
      );
    }
    return res;
  }
}

async function parse<T>(res: Response, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readJson(res));
  if (!parsed.success) throw new ApiError(UNEXPECTED_MESSAGE, res.status);
  return parsed.data;
}

/** The message to show for any failure. */
export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : UNEXPECTED_MESSAGE;
}
