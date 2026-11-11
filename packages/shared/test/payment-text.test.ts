/** Payment instructions on invoices (ADR 0026, P2): bank details and links yes, contact details no. */
import { describe, expect, it } from 'vitest';
import { paymentTextProblem } from '../src/invoices/payment-text.js';

const ok = (text: string): void => {
  expect(paymentTextProblem(text)).toBeNull();
};
const refused = (text: string): void => {
  expect(paymentTextProblem(text)).not.toBeNull();
};

describe('paymentTextProblem (P2, ADR 0026)', () => {
  it('P2: bank details, account numbers, references and payment links are allowed', () => {
    ok('Bank: Example Bank PJSC\nAccount name: Primary Fixers LLC\nIBAN: AE07 0000 0000 0000 0000 000');
    ok('IBAN AE070000000000000000000');
    ok('Account number 1012345678901, SWIFT EXAMAEAD');
    ok('Pay online: https://pay.example.com/invoice/INV-2026-0012');
    ok('Quote reference JAD-2026-0042, due 2026-11-25, amount AED 1,050.00');
  });

  it('P2: UAE mobiles, landlines and international numbers are refused', () => {
    refused('Call 050 000 0000 when paid');
    refused('Mobile: 0500000000');
    refused('Office 04 000 0000');
    refused('Call +971 50 000 0000');
    refused('Call 00971 50 000 0000');
  });

  it('P2: emails and chat links are refused', () => {
    refused('Send the receipt to accounts@example.com');
    refused('WhatsApp us: https://wa.me/971500000000');
    refused('Telegram t.me/primaryfixers');
  });
});
