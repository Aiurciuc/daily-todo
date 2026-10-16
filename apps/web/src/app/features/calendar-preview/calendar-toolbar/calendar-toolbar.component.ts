import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TerraButton, TerraIcon, TerraSegmentedFilter, TerraSegment } from 'terra-ui';
import { DatePipe } from '@angular/common';
import { CalendarView, TaskFilter } from '../calendar-preview.models';
import { CALENDAR_VIEWS } from '../calendar-preview.data';
@Component({
  selector: 'app-calendar-toolbar',
  imports: [DatePipe, TerraButton, TerraIcon, TerraSegmentedFilter],
  templateUrl: './calendar-toolbar.component.html',
  styleUrl: './calendar-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarToolbarComponent {
  readonly view = input.required<CalendarView>();
  readonly filter = input.required<TaskFilter>();
  readonly activeDate = input(new Date());
  readonly rangeStart = input.required<Date>();
  readonly rangeEnd = input.required<Date>();
  readonly month = input.required<Date>();
  readonly offset = input.required<number>();
  readonly viewChanged = output<CalendarView>();
  readonly filterChanged = output<TaskFilter>();
  readonly periodMoved = output<number>();
  readonly todayRequested = output<void>();
  readonly createRequested = output<void>();
  readonly sharedCount = input(0);
  readonly privateCount = input(0);
  protected readonly viewOptions: readonly TerraSegment<CalendarView>[] = CALENDAR_VIEWS.map(
    (value) => ({ value, label: value }),
  );
  protected readonly filterOptions = computed<readonly TerraSegment<TaskFilter>[]>(() => [
    { value: 'All', label: 'All' },
    { value: 'Shared', label: 'Shared', count: this.sharedCount(), icon: 'group' },
    { value: 'Private', label: 'Private', count: this.privateCount(), icon: 'lock' },
  ]);
}
