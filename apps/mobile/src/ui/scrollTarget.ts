/**
 * Opening a tab at the right place (Naya, 10-Nov-2026: "Pay" opened Payments and "Documents" opened My unit
 * wherever they had last been scrolled to). Tabs stay alive between visits, so they keep their scroll
 * position; a link from Home therefore says where to land (`section`) and when it was tapped (`at`), and the
 * tab scrolls there each time a new tap arrives.
 */
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { ScrollHandle } from './kit.js';
import { readScrollParams, type ScrollSection } from './scrollParams.js';

export { scrollParams, type ScrollSection } from './scrollParams.js';

/**
 * For a tab screen: pass `ref` to its Page and `onLayout(section)` to the View around each section. When a link
 * arrives the page scrolls to that section (to the top for "top"), as soon as the section has been laid out.
 */
export function useScrollTarget(): {
  ref: RefObject<ScrollHandle | null>;
  onLayout: (section: ScrollSection) => (e: LayoutChangeEvent) => void;
} {
  const ref = useRef<ScrollHandle | null>(null);
  const offsets = useRef(new Map<ScrollSection, number>([['top', 0]]));
  const pending = useRef<ScrollSection | null>(null);
  const target = readScrollParams(useLocalSearchParams<{ section?: string; at?: string }>());

  const go = useCallback((section: ScrollSection): boolean => {
    const y = offsets.current.get(section);
    if (y === undefined || ref.current === null) return false;
    ref.current.scrollTo({ y, animated: false });
    return true;
  }, []);

  const section = target?.section ?? null;
  const at = target?.at ?? null;
  useEffect(() => {
    if (section === null || at === null) return;
    pending.current = go(section) ? null : section;
  }, [section, at, go]);

  const onLayout = useCallback(
    (name: ScrollSection) => (e: LayoutChangeEvent) => {
      offsets.current.set(name, e.nativeEvent.layout.y);
      if (pending.current === name && go(name)) pending.current = null;
    },
    [go],
  );
  return { ref, onLayout };
}
