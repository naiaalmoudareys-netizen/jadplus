/**
 * JAD+ API application (Hono). Every route is registered here behind the shared middleware:
 * request id → security headers → body size limit → request context → authentication (deny by default).
 * Routes then declare their roles with requireRole() and check object ownership (C-AZ-1, C-AZ-2).
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { adminRoutes } from './admin/routes.js';
import { authenticate } from './auth/middleware.js';
import { authRoutes } from './auth/routes.js';
import { requestContext, type Deps } from './context.js';
import { ApiError } from './errors.js';
import type { AppEnv } from './env.js';
import { createLogger } from './logger.js';
import { partnerRoutes } from './partner/routes.js';
import { deskRoutes } from './portal/desk.js';
import { portalRoutes } from './portal/routes.js';
import { residentRoutes } from './requests/resident.js';
import { routineRoutes } from './requests/routine.js';
import { requestRoutes } from './requests/routes.js';
import { securityHeaders } from './security.js';

/** Largest JSON body accepted (photo/PDF uploads use their own endpoint and limit). */
const MAX_JSON_BYTES = 64 * 1024;

export function createApp(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requestId());
  app.use('*', securityHeaders());
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_JSON_BYTES,
      onError: (c) => c.json({ error: 'Request too large.' }, 413),
    }),
  );
  app.use('/api/*', requestContext(deps));
  app.use('/api/*', authenticate());

  app.get('/api/health', (c) => c.json({ ok: true, service: 'jadplus-api' }));
  app.route('/api/auth', authRoutes(deps));
  app.route('/api', requestRoutes(deps));
  app.route('/api', residentRoutes());
  app.route('/api', routineRoutes(deps));
  app.route('/api/owner', portalRoutes(deps));
  app.route('/api/owner', deskRoutes(deps));
  app.route('/api/partner', partnerRoutes());
  app.route('/api/admin', adminRoutes());

  app.notFound((c) => c.json({ error: 'Not found.' }, 404));

  // Never leak internals: unexpected errors return a generic message with the request id for support.
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: err.message, ...err.extra.body }, err.status, err.extra.headers);
    }
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    const log = (c.get('log') as AppEnv['Variables']['log'] | undefined) ?? createLogger({}, deps.logSink);
    log.log('error', 'Unhandled error', { err, requestId: c.get('requestId') });
    return c.json({ error: 'Something went wrong. Please try again.', requestId: c.get('requestId') }, 500);
  });

  return app;
}
