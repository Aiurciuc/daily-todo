import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  TerraModal,
  TerraButton,
  TerraIcon,
  TerraField,
  TerraCheckbox,
  TerraRadioCard,
} from 'terra-ui';
import { CalendarTask, NewCalendarTask } from '../calendar-preview.models';
import { formatCalendarTime } from '../calendar-preview.utils';
@Component({
  selector: 'app-task-dialog',
  imports: [TerraModal, TerraButton, TerraIcon, TerraField, TerraCheckbox, TerraRadioCard],
  templateUrl: './task-dialog.component.html',
  styleUrl: './task-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDialogComponent {
  readonly taskCreated = output<NewCalendarTask>();
  readonly saving = input(false);
  readonly error = input('');
  private readonly dialog = viewChild.required(TerraModal);
  private readonly form = viewChild.required<ElementRef<HTMLFormElement>>('taskForm');
  protected readonly titleError = signal('');
  protected readonly editing = signal(false);
  protected readonly unscheduled = signal(false);
  protected readonly shared = signal(false);

  protected setShared(shared: boolean): void {
    this.shared.set(shared);
    if (!shared) this.setValue('sharedWith', '');
  }

  open(date: string, hour = 9): void {
    this.form().nativeElement.reset();
    this.editing.set(false);
    this.shared.set(false);
    this.unscheduled.set(false);
    this.setValue('date', date);
    this.setValue('time', formatCalendarTime(hour));
    this.titleError.set('');
    this.dialog().open();
  }

  edit(task: CalendarTask): void {
    this.open(task.date, task.start);
    this.editing.set(true);
    this.shared.set(task.shared);
    this.unscheduled.set(task.scheduled === false);
    this.setValue('title', task.title);
    this.setValue('duration', String(task.duration * 60 || 60));
    this.setValue('notes', task.notes ?? '');
    this.setValue('sharedWith', task.sharedWith ?? '');
    const radio = this.form().nativeElement.querySelector<HTMLInputElement>(
      `[name="visibility"][value="${task.shared ? 'SHARED' : 'PRIVATE'}"]`,
    );
    if (radio) radio.checked = true;
  }

  close(afterSave = false): void {
    if (afterSave || !this.saving()) this.dialog().close();
  }

  private setValue(name: string, value: string): void {
    (this.form().nativeElement.elements.namedItem(name) as HTMLInputElement).value = value;
  }

  protected saveTask(event: Event): void {
    event.preventDefault();
    if (this.saving()) return;
    const form = this.form().nativeElement;
    const recipient = form.elements.namedItem('sharedWith') as HTMLInputElement;
    recipient.value = this.shared() ? recipient.value.trim().toLowerCase() : '';
    const data = new FormData(form);
    const title = String(data.get('title') ?? '').trim();
    if (!title) {
      this.titleError.set('Enter a task name.');
      return;
    }
    const [hour, minute] = String(data.get('time')).split(':').map(Number);
    const startMinute = this.unscheduled() ? null : hour * 60 + minute;
    const durationMinutes = this.unscheduled() ? null : Number(data.get('duration'));
    if (startMinute !== null && durationMinutes !== null && startMinute + durationMinutes > 1440) {
      this.titleError.set('The task must end within the selected date.');
      return;
    }
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    this.titleError.set('');
    this.taskCreated.emit({
      title,
      date: String(data.get('date')),
      startMinute,
      durationMinutes,
      visibility: data.get('visibility') === 'SHARED' ? 'SHARED' : 'PRIVATE',
      notes: String(data.get('notes') ?? '').trim() || null,
      sharedWith: this.shared() ? recipient.value : null,
    });
    // The parent closes only after persistence succeeds; failed submissions keep the draft.
  }
}
