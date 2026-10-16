import { CalendarDay } from './calendar-preview.models';
export function formatCalendarTime(value: number): string {
  const minutes = Math.round(value * 60);
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}
export function dateKey(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}
export function localDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}
export function dateFromParts(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date;
}
export function dayDifference(a: Date, b: Date): number {
  const utcDay = (date: Date) => {
    const utc = new Date(0);
    utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    return utc.getTime();
  };
  return Math.round((utcDay(a) - utcDay(b)) / 86400000);
}
export function calendarDayDate(offset: number, day: number): Date {
  const today = new Date();
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - ((today.getDay() + 6) % 7) + offset * 7 + day,
  );
}
export function buildMonthDays(month: Date): CalendarDay[] {
  const leading = (month.getDay() + 6) % 7;
  const daysInMonth = dateFromParts(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const length = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from({ length }, (_, i) => {
    const date = dateFromParts(month.getFullYear(), month.getMonth(), i - leading + 1);
    return { date, day: date.getDate(), current: date.getMonth() === month.getMonth() };
  });
}
