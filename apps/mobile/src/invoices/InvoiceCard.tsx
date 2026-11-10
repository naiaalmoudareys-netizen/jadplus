/**
 * The partner's invoice on the owner's request page (ADR 0026): number, partner, amount, 5% VAT and total, the
 * due date (overdue in red), where it stands, and how to pay the partner (their own text, selectable to copy).
 * The owner pays the partner directly; JAD+ and JAD Global take no payments. "I have paid" when allowed.
 */
import { VAT_PERCENT, dubaiDate, type InvoiceStatus, type OwnerInvoice } from '@jadplus/shared';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { requestInvoice } from '../api/endpoints.js';
import { useLang } from '../i18n/I18nProvider.js';
import { longDate } from '../portal/format.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad } from '../ui/hooks.js';
import { Body, Card, Eyebrow, Notice } from '../ui/kit.js';
import { colors, fonts, space } from '../ui/theme.js';
import { ClaimPaid } from './ClaimPaid.js';
import { aedFromFils, dueText, invoiceStatusKey, isUnpaid } from './logic.js';

/** Loads the request's invoice; shows nothing while there is none. */
export function RequestInvoice({ requestId }: { requestId: string }): ReactNode {
  const { api } = useSessionController();
  const load = useCallback(() => requestInvoice(api, requestId), [api, requestId]);
  const invoice = useLoad(load);
  if (invoice.error !== null) return <Notice tone="error">{invoice.error}</Notice>;
  if (invoice.data === null) return null;
  return <InvoiceCard invoice={invoice.data} onChanged={() => void invoice.reload()} />;
}

export function InvoiceCard({
  invoice,
  onChanged,
}: {
  invoice: OwnerInvoice;
  onChanged: () => void;
}): ReactNode {
  const lang = useLang();
  const { t, locale } = lang;
  const today = dubaiDate(Date.now());
  const due = dueText(invoice, today, lang);
  return (
    <Card>
      <View style={styles.titleRow}>
        <Eyebrow>{t('invoice.title')}</Eyebrow>
        <StatusPill status={invoice.status} overdue={invoice.overdue} label={t(invoiceStatusKey(invoice))} />
      </View>
      <Text style={styles.big}>{aedFromFils(invoice.totalFils, locale)}</Text>
      <Body muted>
        {invoice.number} · {invoice.partnerName}
      </Body>
      {due === '' ? null : <Text style={[styles.due, invoice.overdue && styles.urgent]}>{due}</Text>}
      <View style={styles.lines}>
        <Line label={t('invoice.subtotal')} value={aedFromFils(invoice.subtotalFils, locale)} />
        <Line
          label={t('invoice.vat', { percent: VAT_PERCENT })}
          value={aedFromFils(invoice.vatFils, locale)}
        />
        <Line label={t('invoice.total')} value={aedFromFils(invoice.totalFils, locale)} strong />
      </View>
      {invoice.status === 'claimed_paid' && invoice.claimedPaidOn !== null ? (
        <Body muted>{t('invoice.claimedOn', { date: longDate(invoice.claimedPaidOn, locale) })}</Body>
      ) : null}
      {isUnpaid(invoice) ? (
        <View style={styles.pay}>
          <Eyebrow>{t('invoice.howToPay')}</Eyebrow>
          <Text selectable style={styles.instructions}>
            {invoice.paymentInstructions}
          </Text>
          <Body muted>{t('invoice.payDirect')}</Body>
        </View>
      ) : null}
      {invoice.actions.includes('claim_paid') ? (
        <ClaimPaid invoiceId={invoice.id} today={today} onDone={onChanged} />
      ) : null}
    </Card>
  );
}

function Line(props: { label: string; value: string; strong?: boolean }): ReactNode {
  const strong = props.strong === true;
  return (
    <View style={styles.line}>
      <Text style={[styles.lineText, strong && styles.strong]}>{props.label}</Text>
      <Text style={[styles.lineText, styles.amount, strong && styles.strong]}>{props.value}</Text>
    </View>
  );
}

/** Red when overdue, bronze while waiting for the partner, green once paid, plain otherwise. */
export function StatusPill(props: { status: InvoiceStatus; overdue: boolean; label: string }): ReactNode {
  const overdue = props.status === 'issued' && props.overdue;
  const waiting = props.status === 'claimed_paid';
  const paid = props.status === 'paid';
  return (
    <View
      style={[styles.pill, overdue && styles.pillUrgent, waiting && styles.pillWait, paid && styles.pillOk]}
    >
      <Text
        style={[
          styles.pillText,
          overdue && styles.urgent,
          waiting && styles.pillTextWait,
          paid && styles.pillTextOk,
        ]}
      >
        {props.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  big: { fontFamily: fonts.semibold, fontSize: 20, color: colors.navy, fontVariant: ['tabular-nums'] },
  due: { fontFamily: fonts.medium, fontSize: 14, color: colors.textSecondary },
  urgent: { color: colors.urgent },
  lines: {
    gap: 2,
    marginTop: space.xs,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  lineText: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary },
  amount: { fontVariant: ['tabular-nums'] },
  strong: { fontFamily: fonts.semibold, color: colors.text },
  pay: { gap: space.xs, marginTop: space.sm },
  instructions: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  pill: {
    flexShrink: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.backgroundAlt,
  },
  pillUrgent: { backgroundColor: colors.urgentSoft },
  pillWait: { backgroundColor: colors.warnSoft },
  pillOk: { backgroundColor: colors.okSoft },
  pillText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  pillTextWait: { color: colors.warn },
  pillTextOk: { color: colors.ok },
});
