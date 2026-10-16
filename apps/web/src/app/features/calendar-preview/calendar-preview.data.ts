import { CalendarView, TaskFilter } from './calendar-preview.models';
export const CALENDAR_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const CALENDAR_HOURS = Array.from({ length: 24 }, (_, i) => i);
export const CALENDAR_VIEWS: readonly CalendarView[] = ['Day', 'Week', 'Month'];
export const TASK_FILTERS: readonly TaskFilter[] = ['All', 'Shared', 'Private'];
