/** The console page and its production headers keep the strict web controls (docs/SECURITY.md, ADR 0022). */
import { describe, expect, it } from 'vitest';
import headers from '../public/_headers?raw';
import html from '../index.html?raw';

describe('web security of the console', () => {
  it('C-HDR: production headers carry a strict CSP and the other protections', () => {
    const csp = /Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? '';
    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' blob: data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(headers).toMatch(/Strict-Transport-Security: max-age=\d+; includeSubDomains/);
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: no-referrer');
    expect(headers).toContain('Permissions-Policy: camera=()');
  });

  it('C-HDR: the page has no inline script or style, and no third-party resources', () => {
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    expect(html).not.toMatch(/<style/);
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/https?:\/\//);
  });
});
