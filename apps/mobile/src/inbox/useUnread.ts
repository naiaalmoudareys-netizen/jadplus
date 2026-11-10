/**
 * How many notifications are unread, for the bell on Home (ADR 0019). Read again whenever Home comes back into
 * view (e.g. back from the Notifications screen) and every minute while it is shown; nothing runs while Home
 * is hidden. A failed read keeps the last number (the bell is a hint, the screen itself shows errors).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ApiClient } from '../api/client.js';
import { inbox } from '../api/endpoints.js';

const EVERY_MS = 60_000;

export function useUnread(api: ApiClient): number {
  const [unread, setUnread] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      const read = () => {
        inbox(api)
          .then((answer) => {
            if (live) setUnread(answer.unread);
          })
          .catch(() => undefined);
      };
      read();
      const id = setInterval(read, EVERY_MS);
      return () => {
        live = false;
        clearInterval(id);
      };
    }, [api]),
  );
  return unread;
}
