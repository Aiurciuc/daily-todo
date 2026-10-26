import { HttpErrorResponse } from '@angular/common/http';
import { PersistedCalendarTask } from '../calendar-preview.models';
import { localDate } from '../calendar-preview.utils';
import {
  calendarMutationError,
  taskMoveDraft,
  taskSchedule,
  toCalendarTask,
} from './calendar-task.helpers';

const task: PersistedCalendarTask = {
  id: 7,
  title: 'Minutes matter',
  date: '2026-10-20',
  startMinute: 577,
  durationMinutes: 75,
  visibility: 'SHARED',
  notes: 'Keep',
  sharedWith: 'reader@example.com',
  completed: true,
};

describe('calendar task helpers', () => {
  it('projects layout fields without changing persisted metadata', () => {
    expect(toCalendarTask(task, localDate('2026-10-19'))).toMatchObject({
      ...task,
      day: 1,
      start: 577 / 60,
      duration: 75 / 60,
      scheduled: true,
      shared: true,
      canEdit: true,
    });
    expect(
      toCalendarTask(
        { ...task, startMinute: null, durationMinutes: null, canEdit: false },
        localDate('2026-10-19'),
      ),
    ).toMatchObject({ start: 0, duration: 0, scheduled: false, canEdit: false });
  });

  it('extracts only scheduling for rollback', () => {
    expect(taskSchedule(task)).toEqual({ date: task.date, startMinute: 577, durationMinutes: 75 });
  });

  it('retains the full PUT metadata while clearing or restoring a schedule', () => {
    expect(taskMoveDraft(task, task.date, null)).toEqual({
      title: task.title,
      date: task.date,
      startMinute: null,
      durationMinutes: null,
      visibility: task.visibility,
      notes: task.notes,
      sharedWith: task.sharedWith,
    });
    expect(
      taskMoveDraft({ ...task, startMinute: null, durationMinutes: null }, task.date, 0),
    ).toMatchObject({ startMinute: 0, durationMinutes: 60 });
    expect(taskMoveDraft(task, '2026-10-21', 620)).toMatchObject({ durationMinutes: 75 });
  });

  it.each([
    ['2026-10-20', 577],
    ['2026-02-30', 600],
    ['nonsense', 600],
    ['2026-10-21', -1],
    ['2026-10-21', 600.5],
    ['2026-10-21', 1400],
  ] as const)('rejects no-op or invalid move %s %s', (date, minute) => {
    expect(taskMoveDraft(task, date, minute)).toBeNull();
  });

  it.each([
    { message: 'Unknown recipient' },
    { message: ['Unknown recipient', 'Try another email'] },
  ])('extracts validation messages: $message', ({ message }) => {
    const error = new HttpErrorResponse({ status: 400, error: { message } });
    expect(calendarMutationError(error)).toBe(Array.isArray(message) ? message.join(' ') : message);
  });

  it('uses safe fallbacks for unknown errors and task-not-found responses', () => {
    expect(calendarMutationError(new HttpErrorResponse({ status: 404 }))).toContain(
      'no longer exists',
    );
    for (const error of [
      new Error('Internal secret'),
      new HttpErrorResponse({ status: 500, error: { message: 'Internal secret' } }),
    ]) {
      expect(calendarMutationError(error)).toBe(
        'Could not save changes. Check the API/database connection and try again.',
      );
    }
  });
});
