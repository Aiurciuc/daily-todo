export interface CalendarRange {
  from: string;
  to: string;
}

export interface CalendarTask {
  id: number;
  title: string;
  date: string;
  day: number;
  start: number;
  duration: number;
  scheduled?: boolean;
  shared: boolean;
  canEdit?: boolean;
  completed?: boolean;
  notes?: string | null;
  sharedWith?: string | null;
}
export interface NewCalendarTask {
  title: string;
  date: string;
  startMinute: number | null;
  durationMinutes: number | null;
  visibility: 'PRIVATE' | 'SHARED';
  notes: string | null;
  sharedWith: string | null;
}
export interface PersistedCalendarTask extends NewCalendarTask {
  id: number;
  canEdit?: boolean;
  completed: boolean;
}
export type CalendarView = 'Day' | 'Week' | 'Month';
export interface CalendarDay {
  date: Date;
  day: number;
  current: boolean;
}
export interface CalendarTaskMove {
  id: number;
  day: number;
  startMinute: number | null;
}
export interface TimeSlot {
  day: number;
  hour: number;
}
