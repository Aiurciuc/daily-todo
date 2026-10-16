import { CdkDrag, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Task } from '../task.model';

export type TaskReorder = { previousIndex: number; currentIndex: number; taskId: number };

@Component({
  selector: 'app-task-list',
  imports: [CdkDrag, CdkDragHandle, CdkDropList],
  templateUrl: './task-list.component.html',
  styleUrl: './task-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskListComponent {
  readonly tasks = input.required<readonly Task[]>();
  readonly loading = input.required<boolean>();
  readonly error = input.required<string>();
  readonly canInteract = input.required<boolean>();

  readonly completionToggled = output<Task>();
  readonly reorderRequested = output<TaskReorder>();

  protected toggleCompletion(task: Task, event: Event): void {
    // The parent owns optimistic state; don't retain a separate checkbox state.
    (event.target as HTMLInputElement).checked = task.completed;
    this.completionToggled.emit(task);
  }
}
