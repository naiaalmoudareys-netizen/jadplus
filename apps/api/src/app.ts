/**
 * JAD+ API application (Hono). Every route is registered here behind the shared middleware:
 * request id → security headers → body size limit → request context → authentication (deny by default).
 * Routes then declare their roles with requireRole() and check object ownership (C-AZ-1, C-AZ-2).
 */
import { PHOTO_MAX_BYTES } from '@jadplus/shared';
import { Hono } from 'hono';
import { except } from 'hono/combine';
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
import { PHOTO_UPLOAD_PATH, photoRoutes } from './requests/photos.js';
import { preferenceRoutes } from './me/preferences.js';
import { inboxRoutes } from './me/inbox.js';
import { approvalRoutes } from './requests/approval.js';
import { tenancyRoutes } from './tenancies/routes.js';
import { partnerFlowRoutes } from './requests/partner-flow.js';
import { partnerVisitRoutes } from './requests/partner-visit.js';
import { partnerStatsRoutes } from './partner/stats.js';
import { partnerOfficeRoutes } from './partner/office.js';
import { adminConsoleRoutes } from './admin/console.js';
import { residentFlowRoutes } from './requests/resident-flow.js';
import { routineRoutes } from './requests/routine.js';
import { requestRoutes } from './requests/routes.js';
import { securityHeaders } from './security.js';

/** Largest JSON body accepted (photo/PDF uploads use their own endpoint and limit). */
const MAX_JSON_BYTES = 64 * 1024;

export function createApp(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requestId());
  app.use('*', securityHeaders());
  // JSON bodies are small; only the photo upload takes a photo-sized body (ADR 0013).
  app.use(
    '/api/*',
    except(
      (c) => c.req.method === 'POST' && PHOTO_UPLOAD_PATH.test(c.req.path),
      bodyLimit({ maxSize: MAX_JSON_BYTES, onError: (c) => c.json({ error: 'Request too large.' }, 413) }),
    ),
  );
  app.post(
    '/api/requests/:id/photos',
    bodyLimit({
      maxSize: PHOTO_MAX_BYTES,
      onError: (c) => c.json({ error: 'Photos can be up to 10 MB.' }, 413),
    }),
  );
  app.use('/api/*', requestContext(deps));
  app.use('/api/*', authenticate());

  app.get('/api/health', (c) => c.json({ ok: true, service: 'jadplus-api' }));
  app.route('/api/auth', authRoutes(deps));
  app.route('/api', requestRoutes(deps));
  app.route('/api', residentRoutes());
  app.route('/api', routineRoutes(deps));
  app.route('/api', photoRoutes());
  app.route('/api', preferenceRoutes());
  app.route('/api/owner', portalRoutes(deps));
  app.route('/api/owner', deskRoutes(deps));
  app.route('/api/partner', partnerRoutes());
  app.route('/api/partner', partnerFlowRoutes());
  app.route('/api/partner', partnerVisitRoutes());
  app.route('/api/partner', partnerStatsRoutes());
  app.route('/api/partner', partnerOfficeRoutes());
  app.route('/api', inboxRoutes());
  app.route('/api', approvalRoutes());
  app.route('/api', tenancyRoutes(deps));
  app.route('/api', residentFlowRoutes());
  app.route('/api/admin', adminRoutes());
  app.route('/api/admin', adminConsoleRoutes());

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
