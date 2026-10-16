import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TerraUrgentTaskRow } from 'terra-ui';
import { CalendarTask } from '../calendar-preview.models';
import { formatCalendarTime } from '../calendar-preview.utils';
@Component({
  selector: 'app-urgent-tasks',
  imports: [DatePipe, TerraUrgentTaskRow],

  templateUrl: './urgent-tasks.component.html',
  styleUrl: './urgent-tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UrgentTasksComponent {
  readonly tasks = input.required<readonly CalendarTask[]>();
  readonly taskSelected = output<CalendarTask>();
  protected readonly time = formatCalendarTime;
}
