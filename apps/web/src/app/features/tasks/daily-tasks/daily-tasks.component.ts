import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { DailyTasksStore } from '../daily-tasks.store';
import { TaskListComponent } from '../task-list/task-list.component';

@Component({
  selector: 'app-daily-tasks',
  imports: [FormField, TaskListComponent],
  providers: [DailyTasksStore],
  templateUrl: './daily-tasks.component.html',
  styleUrl: './daily-tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyTasksComponent {
  readonly store = inject(DailyTasksStore);
  protected readonly savedAnnouncement = computed(() => {
    const saved = this.store
      .toasts()
      .filter((toast) => toast.kind === 'success')
      .at(-1);
    return saved ? `${saved.message} Change ${saved.id}.` : '';
  });

  protected submit(event: Event): void {
    event.preventDefault();
    void this.store.add();
  }
}
