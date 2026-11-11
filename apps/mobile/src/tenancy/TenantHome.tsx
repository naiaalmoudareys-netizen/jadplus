/**
 * The tenant's tenancies on Home (ADR 0021; R2, U4): each open invitation with "Accept", and the current home
 * with its end date and, within 30 days of the end, how many days are left.
 */
import { dubaiDate, type TenantTenancy } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { acceptTenancy } from '../api/endpoints.js';
import { GuideLink } from '../building/BuildingParts.js';
import { BuildingHelpLink } from '../building/HelpLines.js';
import { useLang } from '../i18n/I18nProvider.js';
import { longDate } from '../portal/format.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Card, Eyebrow, Notice } from '../ui/kit.js';
import { colors, fonts } from '../ui/theme.js';
import { useAction } from '../ui/useAction.js';
import { invitationText, tenantHomeNote, tenantPlace } from './logic.js';

function Invitation(props: { tenancy: TenantTenancy; onAccepted: () => void }): ReactNode {
  const { api } = useSessionController();
  const lang = useLang();
  const action = useAction();
  return (
    <Card>
      <Eyebrow>{lang.t('tenancy.invitation')}</Eyebrow>
      <Body>{invitationText(props.tenancy, lang)}</Body>
      <Body muted>{lang.t('tenancy.acceptNote')}</Body>
      <Button
        title={lang.t('tenancy.accept')}
        busy={action.busy}
        onPress={() => void action.run(() => acceptTenancy(api, props.tenancy.id), props.onAccepted)}
      />
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
    </Card>
  );
}

function CurrentHome({ tenancy, today }: { tenancy: TenantTenancy; today: string }): ReactNode {
  const lang = useLang();
  const note = tenantHomeNote(tenancy, today, lang);
  const soon = note !== null && tenancy.startsOn <= today;
  return (
    <Card>
      <Eyebrow>{lang.t('tenancy.yourHome')}</Eyebrow>
      <Text style={styles.place}>{tenantPlace(tenancy, lang.t)}</Text>
      <Body muted>{lang.t('tenancy.homeUntil', { date: longDate(tenancy.endsOn, lang.locale) })}</Body>
      {note === null ? null : <Text style={[styles.note, soon && styles.warn]}>{note}</Text>}
      {tenancy.startsOn <= today ? (
        <>
          <GuideLink />
          <BuildingHelpLink />
        </>
      ) : null}
    </Card>
  );
}

export function TenantHome(props: { tenancies: readonly TenantTenancy[]; onChanged: () => void }): ReactNode {
  const today = dubaiDate(Date.now());
  return (
    <>
      {props.tenancies.map((x) =>
        x.status === 'invited' ? (
          <Invitation key={x.id} tenancy={x} onAccepted={props.onChanged} />
        ) : (
          <CurrentHome key={x.id} tenancy={x} today={today} />
        ),
      )}
    </>
  );
}

const styles = StyleSheet.create({
  place: { fontFamily: fonts.medium, fontSize: 18, color: colors.navy },
  note: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 20, color: colors.slate },
  warn: { color: colors.warn },
});
