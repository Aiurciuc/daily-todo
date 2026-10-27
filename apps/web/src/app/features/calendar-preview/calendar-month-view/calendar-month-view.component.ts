import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CalendarDay, CalendarTask } from '../calendar-preview.models';
import { dateKey } from '../calendar-preview.utils';
import { CALENDAR_WEEKDAYS } from '../calendar-preview.data';
@Component({
  selector: 'app-calendar-month-view',
  imports: [DatePipe],
  templateUrl: './calendar-month-view.component.html',
  styleUrl: './calendar-month-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarMonthViewComponent {
  readonly days = input.required<readonly CalendarDay[]>();
  readonly tasks = input.required<readonly CalendarTask[]>();
  readonly dateKey = dateKey;
  readonly dateSelected = output<Date>();
  readonly weekdays = CALENDAR_WEEKDAYS;
  taskSummary(cell: CalendarDay): string {
    const titles = this.tasks()
      .filter((task) => task.date === dateKey(cell.date))
      .map((task) => task.title);
    return titles.length ? ': ' + titles.join(', ') : '';
  }
}
