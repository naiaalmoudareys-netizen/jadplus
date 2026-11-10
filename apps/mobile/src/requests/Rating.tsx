/**
 * Rating the job once it is closed (S5; ADR 0018): 1 to 5 stars and an optional comment, sent once. The
 * rating feeds the partner's scorecard; afterwards the given rating is shown.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { RequestDetail } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { rateRequest } from '../api/endpoints.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Card, Eyebrow, Field, Notice } from '../ui/kit.js';
import { useAction } from '../ui/useAction.js';
import { colors, space } from '../ui/theme.js';

const STARS = [1, 2, 3, 4, 5] as const;

function Stars(props: { value: number; onChoose?: (stars: number) => void }): ReactNode {
  const t = useT();
  const choose = props.onChoose;
  return (
    <View style={styles.stars} accessibilityRole={choose === undefined ? 'text' : 'radiogroup'}>
      {STARS.map((n) => {
        const icon = (
          <Ionicons
            name={n <= props.value ? 'star' : 'star-outline'}
            size={choose === undefined ? 22 : 36}
            color={colors.bronze}
          />
        );
        if (choose === undefined) return <View key={n}>{icon}</View>;
        return (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={t('journey.rate.star', { n })}
            accessibilityState={{ selected: n === props.value }}
            hitSlop={6}
            onPress={() => {
              choose(n);
            }}
          >
            {icon}
          </Pressable>
        );
      })}
    </View>
  );
}

export function GivenRating({ rating }: { rating: NonNullable<RequestDetail['rating']> }): ReactNode {
  const t = useT();
  return (
    <Card>
      <Eyebrow>{t('journey.rate.yours')}</Eyebrow>
      <View accessible accessibilityLabel={t('journey.rate.star', { n: rating.stars })}>
        <Stars value={rating.stars} />
      </View>
      {rating.comment === null ? null : <Body>{rating.comment}</Body>}
    </Card>
  );
}

export function RateRequest(props: { requestId: string; onDone: () => void }): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const action = useAction();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const send = () => {
    const text = comment.trim();
    void action.run(
      () => rateRequest(api, props.requestId, text === '' ? { stars } : { stars, comment: text }),
      props.onDone,
    );
  };
  return (
    <Card>
      <Eyebrow>{t('journey.rate.title')}</Eyebrow>
      <Stars value={stars} onChoose={setStars} />
      <Field
        label={t('journey.rate.comment')}
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={1000}
      />
      <Button title={t('journey.rate.send')} busy={action.busy} disabled={stars === 0} onPress={send} />
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
    </Card>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: space.sm, marginVertical: space.xs },
});
