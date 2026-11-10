/**
 * Errors the API answers on purpose. Messages are written for the person using the app; they never
 * contain internals or echo what was sent (C-ERR-1). app.ts renders them, so every error response gets
 * the same headers (security headers, request id).
 */
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class ApiError extends HTTPException {
  constructor(
    status: ContentfulStatusCode,
    message: string,
    readonly extra: Readonly<{ headers?: Record<string, string>; body?: Record<string, unknown> }> = {},
  ) {
    super(status, { message });
  }
}
