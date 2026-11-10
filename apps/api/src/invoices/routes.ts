/**
 * Partner invoices (ADR 0026): JAD+ records the invoice and whether it is paid; the owner pays the partner
 * directly. Mounted at /api next to other routers, so every route declares its own roles (no '*' middleware):
 * the partner office (partner_admin) issues and settles its own company's invoices, the owner the invoice was
 * issued to sees it and says "I have paid", JAD+ Admin (jad_admin, jad_viewer) reads them all.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../env.js';
import { registerAdminInvoices } from './admin.js';
import { registerOwnerInvoices } from './owner.js';
import { registerPartnerInvoices } from './partner.js';

export function invoiceRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  registerPartnerInvoices(r);
  registerOwnerInvoices(r);
  registerAdminInvoices(r);
  return r;
}
