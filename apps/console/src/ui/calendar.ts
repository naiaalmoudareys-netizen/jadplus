/**
 * The working calendar the console offers days from (E20, ADR 0028): the public holidays JAD+ Admin keeps, from
 * GET /api/calendar. Until the answer comes, or if it cannot be read, the calendar JAD+ shipped with is used;
 * the API checks the chosen day either way.
 */
import { calendarFromAnswer, calendarResponse, type WorkingCalendar } from '@jadplus/shared';
import { useMemo } from 'react';
import { useConsole, useLoad } from './hooks';

export function useWorkingCalendar(): WorkingCalendar {
  const { api } = useConsole();
  const { state } = useLoad(() => api.get('/api/calendar', calendarResponse), 'calendar');
  const answer = state.status === 'ready' ? state.data : null;
  return useMemo(() => calendarFromAnswer(answer), [answer]);
}
