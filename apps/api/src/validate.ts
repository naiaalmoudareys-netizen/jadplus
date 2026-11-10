/**
 * Input validation at the API boundary (docs/SECURITY.md C-VAL-1). Bodies must be JSON and match a strict
 * zod schema (unknown keys rejected). Error answers name the field and the problem, never echo the value.
 */
import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from './env.js';
import { ApiError } from './errors.js';

/** Route parameters (e.g. :id) are validated like bodies; a malformed id is simply "not found". */
export function parseParams<S extends z.ZodType>(c: Context<AppEnv>, schema: S): z.output<S> {
  const result = schema.safeParse(c.req.param());
  if (!result.success) throw new ApiError(404, 'Not found.');
  return result.data;
}

/** Query strings are validated like bodies (unknown keys rejected). */
export function parseQuery<S extends z.ZodType>(c: Context<AppEnv>, schema: S): z.output<S> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ApiError(400, 'Some details are missing or not valid.', { body: { issues } });
  }
  return result.data;
}

export async function parseJsonBody<S extends z.ZodType>(
  c: Context<AppEnv>,
  schema: S,
): Promise<z.output<S>> {
  if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'Send the request as JSON.');
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, 'The request is not valid JSON.');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ApiError(400, 'Some details are missing or not valid.', { body: { issues } });
  }
  return result.data;
}
