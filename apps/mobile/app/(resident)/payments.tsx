/**
 * Payments (R1, O1, U11): the payment plan with paid / due soon / overdue, totals, receipts and charges.
 * "Pay now" opens JAD Global's secure payment site; JAD+ never takes payments or holds card data.
 */
import { dubaiDate, instalmentState, planSummary } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { aed, longDate, unitTitle } from '../../src/portal/format.js';
import { usePortal } from '../../src/portal/PortalProvider.js';
import { DemoBadge, Fact, Pill, ProgressBar, UnitSwitcher } from '../../src/portal/ui.js';
import { Body, Button, Card, Eyebrow, Heading, Loading, Notice, Page } from '../../src/ui/kit.js';
import { colors, fonts, space } from '../../src/ui/theme.js';

export default function Payments(): ReactNode {
  const { data, error, loading, dealIndex } = usePortal();
  if (loading && data === null) return <Loading />;
  const deal = data?.deals[dealIndex] ?? data?.deals[0];
  if (data === null || deal === undefined) {
    return (
      <Page>
        <Notice tone={error === null ? 'info' : 'error'}>
          {error ?? 'No payment plan found on your account.'}
        </Notice>
      </Page>
    );
  }
  const today = dubaiDate(Date.now());
  const s = planSummary(deal.instalments, deal.price, today);
  const overdue = s.overdueAmount > 1;
  const penalties = deal.penalties.filter((p) => p.outstanding > 1);
  return (
    <Page>
      <DemoBadge />
      <UnitSwitcher />
      <Eyebrow>{unitTitle(deal)}</Eyebrow>
      <Heading>Payments</Heading>
      {overdue ? (
        <Notice tone="error">
          {aed(s.overdueAmount)} is overdue. Settle it whenever you are ready, or ask the JAD+ desk for help.
        </Notice>
      ) : null}
      <Card>
        <Text style={styles.kpiLabel}>PAID SO FAR</Text>
        <Text style={styles.kpi}>
          {aed(s.paid)} <Text style={styles.kpiOf}>of {aed(s.total)}</Text>
        </Text>
        <ProgressBar percent={s.percentPaid} />
        <Body muted>{`${String(Math.round(s.percentPaid))}% paid`}</Body>
        {s.next === null ? null : (
          <View style={styles.next}>
            <Text style={styles.kpiLabel}>NEXT PAYMENT</Text>
            <Text style={styles.nextAmount}>{aed(s.next.state.balance)}</Text>
            <Body muted>
              {s.next.instalment.name}
              {s.next.instalment.due === null ? '' : ` · ${longDate(s.next.instalment.due)}`}
            </Body>
          </View>
        )}
      </Card>
      <Button title="Pay now" onPress={() => void Linking.openURL(data.payUrl)} />
      <Body muted>Opens JAD Global&apos;s secure payment page. JAD+ never sees your card.</Body>

      <Heading>Payment plan</Heading>
      {deal.instalments.map((i) => {
        const st = instalmentState(i, today);
        return (
          <Card key={`${i.name}:${String(i.seq)}`}>
            <View style={styles.rowTop}>
              <Text style={styles.rowTitle}>{i.name}</Text>
              <Pill kind={st.kind} label={st.label} />
            </View>
            <Body>{aed(i.amount)}</Body>
            <Body muted>
              {i.due === null ? '' : `Due ${longDate(i.due)}`}
              {i.paid > 0 && st.kind !== 'paid' ? ` · Paid ${aed(i.paid)}` : ''}
            </Body>
          </Card>
        );
      })}

      {penalties.length === 0 ? null : (
        <>
          <Heading>Late payment fees</Heading>
          <Card>
            {penalties.map((p) => (
              <Fact key={p.name} label={p.for ?? p.name} value={aed(p.outstanding)} />
            ))}
          </Card>
        </>
      )}

      {deal.charges.length === 0 ? null : (
        <>
          <Heading>Fees</Heading>
          <Card>
            {deal.charges.map((c) => (
              <Fact
                key={c.name}
                label={c.name}
                value={
                  c.amount - c.paid <= 1 ? `${aed(c.amount)} · Paid` : `${aed(c.amount - c.paid)} to pay`
                }
              />
            ))}
          </Card>
        </>
      )}

      {deal.receipts.length === 0 ? null : (
        <>
          <Heading>Receipts</Heading>
          <Card>
            {deal.receipts.map((r) => (
              <Fact
                key={r.id}
                label={`${r.name}${r.for === null ? '' : ` · ${r.for}`}`}
                value={`${aed(r.amount)}${r.paidOn === null ? '' : ` · ${longDate(r.paidOn)}`}`}
              />
            ))}
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
