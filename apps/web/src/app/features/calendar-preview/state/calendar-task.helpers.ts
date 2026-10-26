import { HttpErrorResponse } from '@angular/common/http';
import { CalendarTask, NewCalendarTask, PersistedCalendarTask } from '../calendar-preview.models';
import { dateKey, dayDifference, localDate } from '../calendar-preview.utils';

export type TaskSchedule = Pick<PersistedCalendarTask, 'date' | 'startMinute' | 'durationMinutes'>;

const TASK_FIELDS: readonly (keyof PersistedCalendarTask)[] = [
  'id',
  'title',
  'date',
  'startMinute',
  'durationMinutes',
  'visibility',
  'notes',
  'sharedWith',
  'canEdit',
  'completed',
];

/** No-op polls must preserve layout object identities, including active drags. */
export function sameCalendarTasks(
  left: PersistedCalendarTask[],
  right: PersistedCalendarTask[],
): boolean {
  return (
    left.length === right.length &&
    left.every((task, index) => TASK_FIELDS.every((field) => task[field] === right[index][field]))
  );
}

export function taskSchedule(task: PersistedCalendarTask): TaskSchedule {
  return { date: task.date, startMinute: task.startMinute, durationMinutes: task.durationMinutes };
}

export function toCalendarTask(task: PersistedCalendarTask, rangeStart: Date): CalendarTask {
  return {
    ...task,
    day: dayDifference(localDate(task.date), rangeStart),
    start: (task.startMinute ?? 0) / 60,
    duration: (task.durationMinutes ?? 0) / 60,
    scheduled: task.startMinute !== null,
    shared: task.visibility === 'SHARED',
    canEdit: task.canEdit !== false,
  };
}

/** Build the full PUT contract without losing notes, sharing or exact minutes. */
export function taskMoveDraft(
  task: PersistedCalendarTask,
  date: string,
  startMinute: number | null,
): NewCalendarTask | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || dateKey(localDate(date)) !== date) return null;
  const durationMinutes = startMinute === null ? null : (task.durationMinutes ?? 60);
  if (
    startMinute !== null &&
    (!Number.isInteger(startMinute) ||
      startMinute < 0 ||
      durationMinutes === null ||
      durationMinutes < 1 ||
      startMinute + durationMinutes > 1440)
  )
    return null;
  if (task.date === date && task.startMinute === startMinute) return null;
  return {
    title: task.title,
    date,
    startMinute,
    durationMinutes,
    visibility: task.visibility,
    notes: task.notes,
    sharedWith: task.sharedWith,
  };
}

export function calendarMutationError(error: unknown): string {
  const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
  const message = body && typeof body === 'object' && 'message' in body ? body.message : null;
  const validationMessage =
    typeof message === 'string'
      ? message
      : Array.isArray(message) && message.every((item) => typeof item === 'string')
        ? message.join(' ')
        : '';
  return error instanceof HttpErrorResponse && error.status === 400 && validationMessage
    ? validationMessage
    : error instanceof HttpErrorResponse && error.status === 404
      ? 'This task no longer exists. Refresh the calendar.'
      : 'Could not save changes. Check the API/database connection and try again.';
}
