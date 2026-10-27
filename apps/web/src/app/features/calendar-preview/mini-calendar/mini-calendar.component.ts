import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TerraMiniCalendarWidget } from 'terra-ui';
import { calendarDayDate } from '../calendar-preview.utils';
import { CalendarDay } from '../calendar-preview.models';
@Component({
  selector: 'app-mini-calendar',
  imports: [TerraMiniCalendarWidget],
  templateUrl: './mini-calendar.component.html',
  styleUrl: './mini-calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniCalendarComponent {
  readonly month = input.required<Date>();
  readonly days = input.required<readonly CalendarDay[]>();
  readonly activeDay = input.required<number>();
  readonly monthOffset = input.required<number>();
  readonly offset = input.required<number>();
  readonly monthMoved = output<number>();
  readonly dateSelected = output<Date>();
  readonly cells = computed(() => {
    const selected = calendarDayDate(this.offset(), this.activeDay());
    const start = calendarDayDate(this.offset(), 0);
    const end = calendarDayDate(this.offset(), 6);
    return this.days().map((cell) => ({
      ...cell,
      selected: cell.date.toDateString() === selected.toDateString(),
      inRange: cell.date >= start && cell.date <= end,
    }));
  });
}
