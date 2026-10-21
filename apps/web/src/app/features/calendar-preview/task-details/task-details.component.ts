import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { formatDate } from '@angular/common';
import { TerraButton, TerraIcon, TerraTaskInspectorCard, TerraTaskDetails } from 'terra-ui';
import { CalendarTask } from '../calendar-preview.models';
import { formatCalendarTime } from '../calendar-preview.utils';
@Component({
  selector: 'app-task-details',
  imports: [TerraButton, TerraIcon, TerraTaskInspectorCard],
  templateUrl: './task-details.component.html',
  styleUrl: './task-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDetailsComponent {
  readonly task = input.required<CalendarTask>();
  readonly selectedDate = input.required<Date>();
  readonly saving = input(false);
  readonly deleteRequested = output<void>();
  readonly completionToggled = output<void>();
  readonly editRequested = output<void>();
  readonly linkRequested = output<void>();
  protected readonly details = computed<TerraTaskDetails>(() => {
    const task = this.task();
    return {
      title: task.title,
      shared: task.shared,
      completed: task.completed,
      timeLabel:
        task.scheduled === false
          ? 'Unscheduled'
          : formatCalendarTime(task.start) +
            ' – ' +
            formatCalendarTime(task.start + task.duration) +
            ' (' +
            task.duration +
            ' hrs)',
      dateLabel: formatDate(this.selectedDate(), 'EEE, MMM d', 'en-US'),
      notes: task.notes ?? undefined,
    };
  });
}
