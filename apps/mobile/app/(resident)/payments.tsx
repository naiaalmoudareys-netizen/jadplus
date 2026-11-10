/**
 * Payments (R1, O1, U11): the payment plan with paid / due soon / overdue, totals, receipts and charges.
 * "Pay now" opens JAD Global's secure payment site; JAD+ never takes payments or holds card data.
 */
import { dubaiDate, instalmentState, planSummary } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
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
        <Notice>No payment plan found on your account.</Notice>
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
              <LineItem
                key={p.name}
                title={p.for ?? p.name}
                detail={p.start === null ? null : `Since ${longDate(p.start)}`}
                amount={aed(p.outstanding)}
                tone="bad"
              />
            ))}
          </Card>
        </>
      )}

      {deal.charges.length === 0 ? null : (
        <>
          <Heading>Fees</Heading>
          <Card>
            {deal.charges.map((c) => {
              const paid = c.amount - c.paid <= 1;
              return (
                <LineItem
                  key={c.name}
                  title={c.name}
                  detail={c.due === null ? null : longDate(c.due)}
                  amount={aed(paid ? c.amount : c.amount - c.paid)}
                  note={paid ? 'Paid' : 'To pay'}
                  tone={paid ? 'good' : 'normal'}
                />
              );
            })}
          </Card>
        </>
      )}

      {deal.receipts.length === 0 ? null : (
        <>
          <Heading>Receipts</Heading>
          <Card>
            {deal.receipts.map((r) => (
              <LineItem
                key={r.id}
                title={r.for ?? 'Payment'}
                detail={[r.name, r.method].filter((x) => x !== null).join(' · ')}
                amount={aed(r.amount)}
                note={doc.opening === r.fileId ? 'Opening…' : r.paidOn === null ? null : longDate(r.paidOn)}
                {...(r.fileId === null
                  ? {}
                  : {
                      onPress: () => {
                        if (r.fileId !== null) doc.open(r.fileId, `Receipt ${r.name}`);
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
