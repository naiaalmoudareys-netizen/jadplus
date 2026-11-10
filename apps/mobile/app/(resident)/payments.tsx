/**
 * Payments (R1, O1, U11): the payment plan with paid / due soon / overdue, totals, receipts and charges.
 * "Pay now" opens JAD Global's secure payment site; JAD+ never takes payments or holds card data.
 */
import { dubaiDate, instalmentState, planSummary } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLang } from '../../src/i18n/I18nProvider.js';
import { instalmentLabel } from '../../src/i18n/sharedLabels.js';
import { aed, longDate, unitTitle } from '../../src/portal/format.js';
import { usePortal } from '../../src/portal/PortalProvider.js';
import { useOpenDocument } from '../../src/portal/useOpenDocument.js';
import { DemoBadge, LineItem, Pill, PortalError, ProgressBar, UnitSwitcher } from '../../src/portal/ui.js';
import { Body, Button, Card, Eyebrow, Heading, Loading, Notice, Page } from '../../src/ui/kit.js';
import { useScrollTarget } from '../../src/ui/scrollTarget.js';
import { colors, fonts, space } from '../../src/ui/theme.js';

export default function Payments(): ReactNode {
  const { data, error, loading, dealIndex } = usePortal();
  const doc = useOpenDocument();
  const scroll = useScrollTarget();
  const { t, locale } = useLang();
  if (loading && data === null) return <Loading />;
  if (data === null || error !== null) {
    return (
      <Page>
        <PortalError />
      </Page>
    );
  }
  const deal = data.deals[dealIndex] ?? data.deals[0];
  if (deal === undefined) {
    return (
      <Page>
        <Notice>{t('owner.payments.none')}</Notice>
      </Page>
    );
  }
  const today = dubaiDate(Date.now());
  const s = planSummary(deal.instalments, deal.price, today);
  const overdue = s.overdueAmount > 1;
  const penalties = deal.penalties.filter((p) => p.outstanding > 1);
  return (
    <Page scrollRef={scroll.ref}>
      <DemoBadge />
      <UnitSwitcher />
      <Eyebrow>{unitTitle(deal, t)}</Eyebrow>
      <Heading>{t('tab.payments')}</Heading>
      {overdue ? (
        <Notice tone="error">
          {t('owner.payments.overdueNotice', { amount: aed(s.overdueAmount, locale) })}
        </Notice>
      ) : null}
      <Card>
        <Text style={styles.kpiLabel}>{t('owner.payments.paidSoFar').toUpperCase()}</Text>
        <Text style={styles.kpi}>
          {aed(s.paid, locale)}{' '}
          <Text style={styles.kpiOf}>{t('owner.payments.of', { total: aed(s.total, locale) })}</Text>
        </Text>
        <ProgressBar percent={s.percentPaid} />
        <Body muted>{t('owner.payments.percentPaid', { percent: Math.round(s.percentPaid) })}</Body>
        {s.next === null ? null : (
          <View style={styles.next}>
            <Text style={styles.kpiLabel}>{t('owner.nextPayment').toUpperCase()}</Text>
            <Text style={styles.nextAmount}>{aed(s.next.state.balance, locale)}</Text>
            <Body muted>
              {s.next.instalment.name}
              {s.next.instalment.due === null ? '' : ` · ${longDate(s.next.instalment.due, locale)}`}
            </Body>
          </View>
        )}
      </Card>
      <Button title={t('owner.payments.payNow')} onPress={() => void Linking.openURL(data.payUrl)} />
      <Body muted>{t('owner.payments.payNote')}</Body>

      <Heading>{t('owner.payments.plan')}</Heading>
      {deal.instalments.map((i) => {
        const st = instalmentState(i, today);
        return (
          <Card key={`${i.name}:${String(i.seq)}`}>
            <View style={styles.rowTop}>
              <Text style={styles.rowTitle}>{i.name}</Text>
              <Pill kind={st.kind} label={instalmentLabel(i, st, today, t)} />
            </View>
            <Body>{aed(i.amount, locale)}</Body>
            <Body muted>
              {i.due === null ? '' : t('owner.due', { date: longDate(i.due, locale) })}
              {i.paid > 0 && st.kind !== 'paid'
                ? ` · ${t('owner.payments.paidAmount', { amount: aed(i.paid, locale) })}`
                : ''}
            </Body>
          </Card>
        );
      })}

      {penalties.length === 0 ? null : (
        <>
          <Heading>{t('owner.payments.lateFees')}</Heading>
          <Card>
            {penalties.map((p) => (
              <LineItem
                key={p.name}
                title={p.for ?? p.name}
                detail={
                  p.start === null ? null : t('owner.payments.since', { date: longDate(p.start, locale) })
                }
                amount={aed(p.outstanding, locale)}
                tone="bad"
              />
            ))}
          </Card>
        </>
      )}

      {deal.charges.length === 0 ? null : (
        <>
          <Heading>{t('owner.payments.fees')}</Heading>
          <Card>
            {deal.charges.map((c) => {
              const paid = c.amount - c.paid <= 1;
              return (
                <LineItem
                  key={c.name}
                  title={c.name}
                  detail={c.due === null ? null : longDate(c.due, locale)}
                  amount={aed(paid ? c.amount : c.amount - c.paid, locale)}
                  note={paid ? t('instalment.paid') : t('owner.payments.toPay')}
                  tone={paid ? 'good' : 'normal'}
                />
              );
            })}
          </Card>
        </>
      )}

      {deal.receipts.length === 0 ? null : (
        <>
          <Heading>{t('owner.payments.receipts')}</Heading>
          <Card>
            {deal.receipts.map((r) => (
              <LineItem
                key={r.id}
                title={r.for ?? t('owner.payments.payment')}
                detail={[r.name, r.method].filter((x) => x !== null).join(' · ')}
                amount={aed(r.amount, locale)}
                note={
                  doc.opening === r.fileId
                    ? t('owner.opening')
                    : r.paidOn === null
                      ? null
                      : longDate(r.paidOn, locale)
                }
                {...(r.fileId === null
                  ? {}
                  : {
                      onPress: () => {
                        if (r.fileId !== null)
                          doc.open(r.fileId, t('owner.payments.receiptTitle', { name: r.name }));
                      },
                    })}
              />
            ))}
            {doc.error === null ? null : <Notice tone="error">{doc.error}</Notice>}
          </Card>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  kpiLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.muted },
  kpi: { fontFamily: fonts.light, fontSize: 26, color: colors.navy, fontVariant: ['tabular-nums'] },
  kpiOf: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary },
  next: { marginTop: space.sm, gap: space.xs },
  nextAmount: { fontFamily: fonts.medium, fontSize: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, flexShrink: 1 },
});
