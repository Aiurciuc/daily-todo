import {
  buildMonthDays,
  calendarDayDate,
  dateFromParts,
  dateKey,
  dayDifference,
  formatCalendarTime,
  localDate,
} from './calendar-preview.utils';

describe('calendar date/time utilities', () => {
  it('preserves local dates and exact minutes', () => {
    expect(dateKey(localDate('2026-03-29'))).toBe('2026-03-29');
    expect(dayDifference(localDate('2026-03-30'), localDate('2026-03-28'))).toBe(2);
    expect(formatCalendarTime(577 / 60)).toBe('09:37');
    expect(formatCalendarTime(24)).toBe('24:00');
    expect(calendarDayDate(0, 0).getDay()).toBe(1);
  });

  it('does not remap years 1–99 to 1900 when navigating', () => {
    const date = localDate('0001-01-01');
    const offset = dayDifference(date, calendarDayDate(0, 0));
    expect(dateKey(calendarDayDate(Math.floor(offset / 7), ((offset % 7) + 7) % 7))).toBe(
      '0001-01-01',
    );
    const cells = buildMonthDays(dateFromParts(4, 1, 1));
    expect(cells.filter((cell) => cell.current)).toHaveLength(29);
    expect(cells.every((cell) => cell.date.getFullYear() === 4)).toBe(true);
  });
});
