/**
 * "Service invoices" on Payments (ADR 0026): the partners' invoices for work on the owner's requests, apart from
 * JAD Global's payment plan, with what is still to pay at the top. Each opens its request, where the invoice
 * says how to pay the partner directly. Nothing is shown while the owner has no invoice.
 */
import { dubaiDate } from '@jadplus/shared';
import { useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { ownerInvoices } from '../api/endpoints.js';
import { useLang } from '../i18n/I18nProvider.js';
import { LineItem } from '../portal/ui.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad } from '../ui/hooks.js';
import { Body, Card, Heading, Notice } from '../ui/kit.js';
import { aedFromFils, dueText, invoiceStatusKey, orderInvoices } from './logic.js';

export function ServiceInvoices(): ReactNode {
  const { api } = useSessionController();
  const router = useRouter();
  const lang = useLang();
  const { t, locale } = lang;
  const load = useCallback(() => ownerInvoices(api), [api]);
  const answer = useLoad(load);
  if (answer.error !== null) return <Notice tone="error">{answer.error}</Notice>;
  const invoices = answer.data?.invoices ?? [];
  if (answer.data === null || invoices.length === 0) return null;
  const today = dubaiDate(Date.now());
  const outstanding = answer.data.outstandingFils;
  return (
    <>
      <Heading>{t('invoices.section')}</Heading>
      <Body muted>{t('invoices.note')}</Body>
      {outstanding > 0 ? (
        <Notice>{t('invoices.outstanding', { amount: aedFromFils(outstanding, locale) })}</Notice>
      ) : null}
      <Card>
        {orderInvoices(invoices).map((i) => (
          <LineItem
            key={i.id}
            title={i.partnerName}
            detail={[i.number, dueText(i, today, lang)].filter((x) => x !== '').join(' · ')}
            amount={aedFromFils(i.totalFils, locale)}
            note={t(invoiceStatusKey(i))}
            tone={i.status === 'paid' ? 'good' : i.overdue ? 'bad' : 'normal'}
            onPress={() => {
              router.push({ pathname: '/request/[id]', params: { id: i.requestId } });
            }}
          />
        ))}
      </Card>
    </>
  );
}
