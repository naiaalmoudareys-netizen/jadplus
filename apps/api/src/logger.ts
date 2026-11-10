/**
 * Structured logger that redacts personal data and secrets (docs/SECURITY.md C-LOG-1).
 * One JSON line per entry, read by Cloudflare Workers Logs. This module is the only place allowed to
 * write to the console (CLAUDE.md rule 6).
 *
 * Redaction, applied to every field at any depth:
 *  - values of fields whose name suggests personal data or secrets (email, phone, name, token, code, …);
 *  - email addresses, phone numbers and long token-like strings found inside any text.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Readonly<Record<string, unknown>>;

export const REDACTED = '[redacted]';

const SENSITIVE_KEY =
  /(e-?mail|phone|mobile|name|token|secret|password|passcode|code|otp|authorization|cookie|key|ip$|^ip|address|passport|emirates|national)/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** International or local phone numbers: optional +, then 9-15 digits with spaces, dots or dashes. */
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
/** Base64url / hex runs long enough to be a token or key. */
const TOKEN_LIKE = /[A-Za-z0-9_-]{32,}/g;
const MAX_DEPTH = 5;

/** Field names that are known to be safe even though they match the sensitive pattern. */
const SAFE_KEYS: ReadonlySet<string> = new Set(['requestId', 'service_code', 'serviceCode', 'statusCode']);

export function redactText(text: string): string {
  return text.replace(EMAIL, REDACTED).replace(TOKEN_LIKE, REDACTED).replace(PHONE, REDACTED);
}

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return value;
  }
  if (depth >= MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { error: value.name, message: redactText(value.message) };
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (SAFE_KEYS.has(key) && (typeof v === 'string' || typeof v === 'number')) out[key] = v;
      else out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return REDACTED;
}

export interface Logger {
  log(level: LogLevel, message: string, fields?: LogFields): void;
}

/** Where log lines go. The default writes to the Workers console; tests pass a collector. */
export type LogSink = (line: string) => void;

const consoleSink: LogSink = (line) => {
  // eslint-disable-next-line no-console -- the redacting logger is the single, reviewed console writer.
  console.log(line);
};

export function createLogger(base: LogFields = {}, sink: LogSink = consoleSink): Logger {
  return {
    log(level, message, fields = {}) {
      const entry = { level, message: redactText(message), ...(redact({ ...base, ...fields }) as object) };
      sink(JSON.stringify({ at: new Date().toISOString(), ...entry }));
    },
  };
}
