/**
 * The working calendar the app offers days from (E20, ADR 0028): the public holidays JAD+ Admin keeps, read
 * from the API once per screen. Until the answer comes, or if it cannot be read, the calendar JAD+ shipped
 * with is used; the API checks the chosen day either way.
 */
import { calendarFromAnswer, type WorkingCalendar } from '@jadplus/shared';
import { useCallback, useMemo } from 'react';
import { workingCalendar } from '../api/endpoints.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad } from './hooks.js';

export function useWorkingCalendar(): WorkingCalendar {
  const { api } = useSessionController();
  const load = useCallback(() => workingCalendar(api), [api]);
  const { data } = useLoad(load);
  return useMemo(() => calendarFromAnswer(data), [data]);
}
