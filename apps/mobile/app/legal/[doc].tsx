/** Terms of use or privacy notice, opened from Profile (L1, L2; ADR 0016). */
import { Redirect, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { LegalReader } from '../../src/legal/LegalReader.js';
import { LEGAL_TEXTS, type LegalDoc } from '../../src/legal/texts.js';
import { Page } from '../../src/ui/kit.js';

const asDoc = (value: string | undefined): LegalDoc | null =>
  value === 'terms' || value === 'privacy' ? value : null;

export default function Legal(): ReactNode {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const which = asDoc(doc);
  if (which === null) return <Redirect href="/" />;
  return (
    <Page>
      <LegalReader text={LEGAL_TEXTS[which]} />
    </Page>
  );
}
