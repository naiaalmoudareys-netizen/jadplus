/** Cloudflare bindings and per-request variables available to every handler. */
import type { RequestIdVariables } from 'hono/request-id';
import type { Actor } from '@jadplus/shared';
import type { Keys } from './crypto.js';
import type { Logger } from './logger.js';

export interface Bindings {
  readonly DB: D1Database;
  readonly MEDIA: R2Bucket;
  /** "local" (developer machine), "preview" (demo data only) or "production". */
  readonly ENVIRONMENT: 'local' | 'preview' | 'production';
  /** Secret (wrangler secret put): 32-byte base64 HMAC key for blind indexes and code/IP hashes. */
  readonly INDEX_KEY: string;
  /** Secret (wrangler secret put): 32-byte base64 AES-256-GCM key for personal-data fields. */
  readonly DATA_KEY: string;
  /** Service binding to the finance worker, the only way to Salesforce (C-AUTH-3). Absent until configured. */
  readonly FIN?: Fetcher;
  /** Secret (wrangler secret put): shared with the finance worker's portal door. */
  readonly PORTAL_KEY?: string;
  /** Comma-separated web origins of the JAD+ console allowed to make changes with the session cookie (ADR 0022). */
  readonly CONSOLE_ORIGINS?: string;
}

/** The signed-in person, set by the authenticate middleware (C-SES-1, C-AZ-1). */
export interface Auth extends Actor {
  readonly sessionId: string;
  readonly client: 'mobile' | 'console';
  readonly userStatus: 'active' | 'frozen';
}

export interface AppVariables extends RequestIdVariables {
  keys: Keys;
  log: Logger;
  now: number;
  ipHash: Uint8Array;
  auth: Auth;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: AppVariables;
}
