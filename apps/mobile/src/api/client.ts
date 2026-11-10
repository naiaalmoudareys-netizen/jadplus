/**
 * The app's only way to talk to the JAD+ API. Sends the session token as a Bearer header, validates every
 * answer with the shared schemas (an unexpected answer is an error, never guessed at), gives up after a
 * timeout, and reports a rejected session so the app returns to sign-in (C-SES-1).
 */
import { errorResponse } from '@jadplus/shared';
import type { z } from 'zod';

const DEFAULT_TIMEOUT_MS = 15_000;

/** A failed call, with a message that is safe to show to the person. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const OFFLINE_MESSAGE = 'Cannot reach JAD+. Check your connection and try again.';
const UNEXPECTED_MESSAGE = 'Something went wrong. Please try again.';

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  /** The current session token, or null when signed out. */
  readonly token: () => string | null;
  /** Called when the API says the session is no longer valid (expired, revoked, signed out elsewhere). */
  readonly onUnauthorized: () => void;
  readonly timeoutMs?: number;
}

export interface ApiClient {
  get<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>>;
  post<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.output<S>>;
  /** For calls answered with "204 No Content". */
  postNoContent(path: string, body?: unknown): Promise<void>;
}

export function createApiClient(o: ApiClientOptions): ApiClient {
  async function send(method: 'GET' | 'POST', path: string, body: unknown): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    const credential = o.token();
    if (credential !== null) headers.authorization = `Bearer ${credential}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await o.fetch(`${o.baseUrl}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(o.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch {
      throw new ApiError(0, OFFLINE_MESSAGE);
    }
    if (res.ok) return res;
    if (res.status === 401 && credential !== null) o.onUnauthorized();
    const parsed = errorResponse.safeParse(await res.json().catch(() => null));
    throw new ApiError(
      res.status,
      parsed.success ? parsed.data.error : UNEXPECTED_MESSAGE,
      parsed.success ? (parsed.data.code ?? null) : null,
    );
  }

  async function read<S extends z.ZodType>(res: Response, schema: S): Promise<z.output<S>> {
    const parsed = schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new ApiError(res.status, UNEXPECTED_MESSAGE);
    return parsed.data;
  }

  return {
    get: async (path, schema) => read(await send('GET', path, undefined), schema),
    post: async (path, body, schema) => read(await send('POST', path, body), schema),
    postNoContent: async (path, body) => {
      await send('POST', path, body);
    },
  };
}
