/**
 * JAD+ API application (Hono). Every route is registered here behind the shared middleware:
 * request id → security headers → body size limit → request context → authentication (deny by default).
 * Routes then declare their roles with requireRole() and check object ownership (C-AZ-1, C-AZ-2).
 */
import {
  PARTNER_DOCUMENT_MAX_BYTES,
  PHOTO_MAX_BYTES,
  REPORT_MAX_BYTES,
  STATEMENT_MAX_BYTES,
} from '@jadplus/shared';
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
import { REPORT_UPLOAD_PATH, reportRoutes } from './requests/reports.js';
import { SNAG_PHOTO_UPLOAD_PATH, snagRoutes } from './requests/snags.js';
import { snagViewRoutes } from './requests/snag-views.js';
import { preferenceRoutes } from './me/preferences.js';
import { inboxRoutes } from './me/inbox.js';
import { calendarRoutes } from './me/calendar.js';
import { invoiceRoutes } from './invoices/routes.js';
import { residentBuildingRoutes } from './me/building.js';
import { approvalRoutes } from './requests/approval.js';
import { tenancyRoutes } from './tenancies/routes.js';
import { partnerFlowRoutes } from './requests/partner-flow.js';
import { partnerVisitRoutes } from './requests/partner-visit.js';
import { partnerStatsRoutes } from './partner/stats.js';
import { partnerOfficeRoutes } from './partner/office.js';
import { adminConsoleRoutes } from './admin/console.js';
import { adminOpsRoutes } from './admin/ops.js';
import { adminPlatformRoutes } from './admin/platform.js';
import { adminPartnerExtrasRoutes } from './admin/partner-extras.js';
import { PARTNER_DOCUMENT_UPLOAD_PATH, partnerCompanyRoutes } from './partner/company.js';
import { residentFlowRoutes } from './requests/resident-flow.js';
import { routineRoutes } from './requests/routine.js';
import { requestRoutes } from './requests/routes.js';
import { securityHeaders } from './security.js';
import { consultationRaiseRoutes } from './consultations/raise.js';
import { consultationViewRoutes } from './consultations/routes.js';
import { consultationStepRoutes } from './consultations/steps.js';
import { ownerHandoverRoutes } from './handover/owner.js';
import { handoverStaffRoutes } from './handover/staff.js';
import { ownerEducationRoutes } from './education/owner.js';
import { educationStaffRoutes } from './education/staff.js';
import { managedAdminRoutes } from './managed/admin.js';
import { managedOfficeRoutes } from './managed/office.js';
import { STATEMENT_UPLOAD_PATH, managedStatementRoutes } from './managed/statements.js';
import { projectRoutes } from './requests/project.js';

/** Largest JSON body accepted (photo/PDF uploads use their own endpoint and limit). */
const MAX_JSON_BYTES = 64 * 1024;

export function createApp(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requestId());
  app.use('*', securityHeaders());
  // JSON bodies are small; only the photo upload (ADR 0013) and a partner's document PDF (ADR 0025) take a
  // file-sized body, each with its own limit.
  app.use(
    '/api/*',
    except(
      (c) =>
        c.req.method === 'POST' &&
        (PHOTO_UPLOAD_PATH.test(c.req.path) ||
          PARTNER_DOCUMENT_UPLOAD_PATH.test(c.req.path) ||
          REPORT_UPLOAD_PATH.test(c.req.path) ||
          STATEMENT_UPLOAD_PATH.test(c.req.path) ||
          SNAG_PHOTO_UPLOAD_PATH.test(c.req.path)),
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
  app.post(
    '/api/partner/documents/:kind',
    bodyLimit({
      maxSize: PARTNER_DOCUMENT_MAX_BYTES,
      onError: (c) => c.json({ error: 'Documents can be up to 15 MB.' }, 413),
    }),
  );
  // Flow B (ADR 0032): the report PDF (20 MB) and the snag photos (10 MB, like request photos).
  app.post(
    '/api/requests/:id/report',
    bodyLimit({
      maxSize: REPORT_MAX_BYTES,
      onError: (c) => c.json({ error: 'Reports can be up to 20 MB.' }, 413),
    }),
  );
  app.post(
    '/api/requests/:id/snags/:snagId/:upload{photo|fix}',
    bodyLimit({
      maxSize: PHOTO_MAX_BYTES,
      onError: (c) => c.json({ error: 'Photos can be up to 10 MB.' }, 413),
    }),
  );
  // ADR 0034: a managed unit's monthly statement PDF (20 MB, like reports).
  app.post(
    '/api/partner/managed-units/:id/statements',
    bodyLimit({
      maxSize: STATEMENT_MAX_BYTES,
      onError: (c) => c.json({ error: 'Statements can be up to 20 MB.' }, 413),
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
  app.route('/api', reportRoutes());
  app.route('/api', snagRoutes());
  app.route('/api', snagViewRoutes());
  app.route('/api', preferenceRoutes());
  app.route('/api', calendarRoutes());
  app.route('/api/owner', portalRoutes(deps));
  app.route('/api/owner', deskRoutes(deps));
  app.route('/api/partner', partnerRoutes());
  app.route('/api/partner', partnerFlowRoutes());
  app.route('/api/partner', partnerVisitRoutes());
  app.route('/api/partner', partnerStatsRoutes());
  app.route('/api/partner', partnerOfficeRoutes());
  app.route('/api/partner', partnerCompanyRoutes());
  app.route('/api', inboxRoutes());
  app.route('/api', residentBuildingRoutes());
  app.route('/api', approvalRoutes());
  app.route('/api', tenancyRoutes(deps));
  app.route('/api', residentFlowRoutes());
  app.route('/api', invoiceRoutes());
  app.route('/api', consultationRaiseRoutes(deps));
  app.route('/api', consultationViewRoutes());
  app.route('/api', consultationStepRoutes());
  app.route('/api/admin', adminRoutes());
  app.route('/api/admin', adminConsoleRoutes());
  app.route('/api/admin', adminOpsRoutes());
  app.route('/api/admin', adminPlatformRoutes());
  app.route('/api/admin', adminPartnerExtrasRoutes());
  // Handover checklist and investor education (O2, O5; ADR 0033): owners, the JAD Global team's office, JAD+ Admin.
  app.route('/api', ownerHandoverRoutes());
  app.route('/api', ownerEducationRoutes());
  app.route('/api/partner', handoverStaffRoutes('office'));
  app.route('/api/partner', educationStaffRoutes('office'));
  app.route('/api/admin', handoverStaffRoutes('admin'));
  app.route('/api/admin', educationStaffRoutes('admin'));
  // Managed units, furnishing delivery dates and interior design stages (O4, O5, A1, S4; ADR 0034).
  app.route('/api/partner', managedOfficeRoutes());
  app.route('/api/admin', managedAdminRoutes());
  app.route('/api', managedStatementRoutes());
  app.route('/api', projectRoutes());

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
