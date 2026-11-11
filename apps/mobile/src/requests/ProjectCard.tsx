/**
 * The delivery date of a furnishing request and the stages of an interior design project, on the owner's request
 * page (ADR 0034; S4: "delivery date in writing", O5). Shows nothing until the provider has set a date or reached
 * a stage.
 */
import { dubaiDate } from '@jadplus/shared';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { requestProject } from '../api/managed.js';
import { useLang } from '../i18n/I18nProvider.js';
import { deliveryLines, stageRows } from '../managed/logic.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad } from '../ui/hooks.js';
import { Body, Card, Eyebrow } from '../ui/kit.js';
import { colors, fonts, space } from '../ui/theme.js';

const REFRESH_MS = 30_000;

export function ProjectCard({ requestId }: { requestId: string }): ReactNode {
  const { api } = useSessionController();
  const lang = useLang();
  const load = useCallback(() => requestProject(api, requestId), [api, requestId]);
  const project = useLoad(load, REFRESH_MS);
  const p = project.data;
  if (p === null) return null;
  const lines = deliveryLines(p, lang);
  const stages = stageRows(p, lang, dubaiDate);
  if (lines.length === 0 && stages.length === 0) return null;
  return (
    <Card>
      {lines.map((line, i) => (
        <Body key={line} muted={i > 0}>
          {line}
        </Body>
      ))}
      {stages.length === 0 ? null : (
        <>
          <Eyebrow>{lang.t('project.stages')}</Eyebrow>
          {stages.map((s) => (
            <View key={s.title} style={styles.stage}>
              <View style={[styles.dot, s.reached && styles.reached]} />
              <View style={styles.text}>
                <Text style={[styles.title, !s.reached && styles.pending]}>{s.title}</Text>
                <Text style={styles.detail}>{s.detail}</Text>
                {s.note === null ? null : <Text style={styles.detail}>{s.note}</Text>}
              </View>
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  stage: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    borderWidth: 2,
    borderColor: colors.slate,
  },
  reached: { backgroundColor: colors.navy, borderColor: colors.navy },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.medium, fontSize: 15, color: colors.navy },
  pending: { color: colors.slate },
  detail: { fontFamily: fonts.regular, fontSize: 13, color: colors.slate },
});
