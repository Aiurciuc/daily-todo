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
  readonly details = computed<TerraTaskDetails>(() => {
    const task = this.task();
    const minutes = Math.round(task.duration * 60);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    const duration = [hours ? `${hours}h` : '', remainder || !hours ? `${remainder} min` : '']
      .filter(Boolean)
      .join(' ');
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
            duration +
            ')',
      dateLabel: formatDate(this.selectedDate(), 'EEE, MMM d', 'en-US'),
      notes: task.notes ?? undefined,
    };
  });
}
