import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TerraButton, TerraIcon, TerraSegmentedFilter, TerraSegment } from 'terra-ui';
import { DatePipe } from '@angular/common';
import { CalendarView } from '../calendar-preview.models';
@Component({
  selector: 'app-calendar-header',
  imports: [DatePipe, TerraButton, TerraIcon, TerraSegmentedFilter],

  templateUrl: './calendar-header.component.html',
  styleUrl: './calendar-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarHeaderComponent {
  protected readonly today = new Date();
  protected readonly viewOptions: readonly TerraSegment<CalendarView>[] = [
    { value: 'Day', label: 'Day' },
    { value: 'Week', label: 'Week' },
  ];
  readonly view = input.required<CalendarView>();
  readonly activeDate = input(new Date());
  readonly rangeStart = input.required<Date>();
  readonly month = input(new Date());
  readonly rangeEnd = input.required<Date>();
  readonly offset = input.required<number>();
  readonly viewChanged = output<CalendarView>();
  readonly periodMoved = output<number>();
  readonly todayRequested = output<void>();
  readonly createRequested = output<void>();
}
