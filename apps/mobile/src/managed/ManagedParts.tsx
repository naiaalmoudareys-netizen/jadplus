/**
 * Managed units on My unit (ADR 0034; O4): the "Managed by …" card above the tenant, and the monthly statements
 * under Documents, each opened in the phone's viewer like the owner's other papers (private temp folder).
 */
import type { OwnerManagedUnit } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { statementFilePath } from '../api/managed.js';
import { useLang } from '../i18n/I18nProvider.js';
import { openFile } from '../portal/documents.js';
import { LineItem } from '../portal/ui.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Card, Eyebrow, Notice } from '../ui/kit.js';
import { colors, fonts } from '../ui/theme.js';
import { arrangementPeriod, monthLabel, unitStatements } from './logic.js';

/** "Managed by Harbor Property Management" with the period. */
export function ManagedCard({ arrangement }: { arrangement: OwnerManagedUnit }): ReactNode {
  const lang = useLang();
  return (
    <Card>
      <Eyebrow>{lang.t('managed.title')}</Eyebrow>
      <Text style={styles.name}>{lang.t('managed.by', { provider: arrangement.providerName })}</Text>
      <Body muted>{arrangementPeriod(arrangement, lang)}</Body>
    </Card>
  );
}

/** The unit's statements (current and past arrangements), newest month first; nothing when not managed. */
export function ManagedStatements(props: {
  units: readonly OwnerManagedUnit[];
  unitName: string | null;
}): ReactNode {
  const { api } = useSessionController();
  const { t, locale } = useLang();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unit = { sfUnitId: null, unitName: props.unitName };
  const mine = props.units.filter((m) => m.unitName !== null && m.unitName === props.unitName);
  if (mine.length === 0) return null;
  const statements = unitStatements(props.units, unit);
  const current = mine.find((m) => m.current) ?? null;
  const open = (managedUnitId: string, id: string, title: string) => {
    setOpening(id);
    setError(null);
    openFile(api, statementFilePath(managedUnitId, id), title)
      .catch(() => {
        setError(t('owner.doc.openError'));
      })
      .finally(() => {
        setOpening(null);
      });
  };
  return (
    <>
      <Eyebrow>{t('managed.statements')}</Eyebrow>
      {statements.length === 0 && current !== null ? (
        <Body muted>{t('managed.noStatements', { provider: current.providerName })}</Body>
      ) : null}
      {statements.map((s) => {
        const title = t('managed.statementTitle', { month: monthLabel(s.month, locale) });
        return (
          <LineItem
            key={s.id}
            title={title}
            amount=""
            note={opening === s.id ? t('owner.opening') : null}
            onPress={() => {
              open(s.managedUnitId, s.id, title);
            }}
          />
        );
      })}
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: fonts.medium, fontSize: 18, color: colors.navy },
});
