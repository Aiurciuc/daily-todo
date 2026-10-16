import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
  DestroyRef,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { CalendarHeaderComponent } from './calendar-header/calendar-header.component';
import { CalendarToolbarComponent } from './calendar-toolbar/calendar-toolbar.component';
import { CalendarTimeGridComponent } from './calendar-time-grid/calendar-time-grid.component';
import { CalendarMonthViewComponent } from './calendar-month-view/calendar-month-view.component';
import { MiniCalendarComponent } from './mini-calendar/mini-calendar.component';
import { TaskDetailsComponent } from './task-details/task-details.component';
import { UrgentTasksComponent } from './urgent-tasks/urgent-tasks.component';
import { TaskDialogComponent } from './task-dialog/task-dialog.component';
import { CalendarTask, CalendarView, NewCalendarTask, TaskFilter } from './calendar-preview.models';
import {
  buildMonthDays,
  calendarDayDate,
  dateKey,
  dateFromParts,
  dayDifference,
  localDate,
} from './calendar-preview.utils';
import { CalendarApiService } from './calendar-api.service';

@Component({
  selector: 'app-calendar-preview',
  imports: [
    CalendarHeaderComponent,
    CalendarToolbarComponent,
    CalendarTimeGridComponent,
    CalendarMonthViewComponent,
    MiniCalendarComponent,
    TaskDetailsComponent,
    UrgentTasksComponent,
    TaskDialogComponent,
  ],
  templateUrl: './calendar-preview.component.html',
  styleUrl: './calendar-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPreviewComponent {
  private readonly api = inject(CalendarApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required(TaskDialogComponent);
  protected readonly view = signal<CalendarView>('Week');
  protected readonly filter = signal<TaskFilter>('All');
  protected readonly offset = signal(0);
  protected readonly activeDay = signal((new Date().getDay() + 6) % 7);
  protected readonly monthOffset = signal(0);
  protected readonly notice = signal('');
  protected readonly saving = signal(false);
  protected readonly mutationError = signal('');
  protected readonly editingId = signal<number | null>(null);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly rangeStart = computed(() => calendarDayDate(this.offset(), 0));
  protected readonly rangeEnd = computed(() => calendarDayDate(this.offset(), 6));
  protected readonly activeDate = computed(() => calendarDayDate(this.offset(), this.activeDay()));
  protected readonly miniMonth = computed(() => {
    const now = new Date();
    return dateFromParts(now.getFullYear(), now.getMonth() + this.monthOffset(), 1);
  });
  protected readonly monthDays = computed(() => buildMonthDays(this.miniMonth()));
  private readonly query = computed(() => {
    const cells = this.monthDays();
    const start = this.view() === 'Month' ? cells[0].date : this.rangeStart();
    const end = this.view() === 'Month' ? cells[cells.length - 1].date : this.rangeEnd();
    return {
      from: dateKey(start),
      to: dateKey(dateFromParts(end.getFullYear(), end.getMonth(), end.getDate() + 1)),
    };
  });
  protected readonly resource = this.api.list(this.query);
  protected readonly tasks = computed<CalendarTask[]>(() => {
    const items = this.resource.hasValue() ? this.resource.value() : [];
    return items.map((task) => ({
      ...task,
      day: dayDifference(localDate(task.date), this.rangeStart()),
      start: (task.startMinute ?? 0) / 60,
      duration: (task.durationMinutes ?? 0) / 60,
      scheduled: task.startMinute !== null,
      shared: task.visibility === 'SHARED',
    }));
  });
  protected readonly visibleTasks = computed(() =>
    this.tasks().filter(
      (task) =>
        (this.filter() === 'All' || (this.filter() === 'Shared' ? task.shared : !task.shared)) &&
        (this.view() !== 'Day' || task.day === this.activeDay()),
    ),
  );
  protected readonly sharedCount = computed(
    () => this.tasks().filter((task) => task.shared).length,
  );
  protected readonly privateCount = computed(
    () => this.tasks().filter((task) => !task.shared).length,
  );
  protected readonly selected = computed(() =>
    this.tasks().find((task) => task.id === this.selectedId()),
  );
  protected readonly selectedDate = computed(() =>
    localDate(this.selected()?.date ?? dateKey(this.activeDate())),
  );
  protected readonly urgentTasks = computed(() =>
    this.tasks()
      .filter((task) => !task.completed && task.date >= dateKey(new Date()))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
      .slice(0, 5),
  );

  constructor() {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && dateKey(localDate(date)) === date) {
      this.chooseDate(localDate(date));
    }
    const id = Number(params.get('task'));
    if (Number.isInteger(id) && id > 0) this.selectedId.set(id);
  }

  protected selectTask(task: CalendarTask): void {
    this.selectedId.set(task.id);
    if (task.day >= 0 && task.day < 7) this.activeDay.set(task.day);
  }

  protected movePeriod(direction: number): void {
    if (this.view() === 'Month') this.moveMonth(direction);
    else
      this.chooseDate(
        calendarDayDate(
          this.offset(),
          this.activeDay() + direction * (this.view() === 'Day' ? 1 : 7),
        ),
      );
  }

  protected moveMonth(direction: number): void {
    const month = this.miniMonth();
    if (this.view() === 'Month') {
      const lastDay = dateFromParts(
        month.getFullYear(),
        month.getMonth() + direction + 1,
        0,
      ).getDate();
      this.chooseDate(
        dateFromParts(
          month.getFullYear(),
          month.getMonth() + direction,
          Math.min(this.activeDate().getDate(), lastDay),
        ),
      );
    } else this.monthOffset.update((value) => value + direction);
  }

  protected resetToday(): void {
    this.chooseDate(new Date());
  }

  protected chooseDate(date: Date): void {
    const days = dayDifference(date, calendarDayDate(0, 0));
    this.offset.set(Math.floor(days / 7));
    this.activeDay.set(((days % 7) + 7) % 7);
    const now = new Date();
    this.monthOffset.set(
      (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth(),
    );
  }

  protected openTask(day = this.activeDay(), hour = 9): void {
    if (this.saving()) return;
    this.editingId.set(null);
    this.mutationError.set('');
    const date = this.view() === 'Month' ? this.miniMonth() : calendarDayDate(this.offset(), day);
    this.dialog().open(dateKey(date), hour);
  }

  protected editTask(): void {
    const task = this.selected();
    if (!task || this.saving()) return;
    this.editingId.set(task.id);
    this.mutationError.set('');
    this.dialog().edit(task);
  }

  protected saveTask(draft: NewCalendarTask): void {
    const id = this.editingId();
    this.mutate(id === null ? this.api.create(draft) : this.api.update(id, draft), (task) => {
      this.dialog().close(true);
      this.chooseDate(localDate(task.date));
      this.selectedId.set(task.id);
      this.notice.set(id === null ? 'Task created.' : 'Task updated.');
    });
  }

  protected toggleCompleted(): void {
    const task = this.selected();
    if (task)
      this.mutate(this.api.setCompleted(task.id, !task.completed), () =>
        this.notice.set(task.completed ? 'Task reopened.' : 'Task completed.'),
      );
  }

  protected deleteTask(): void {
    const task = this.selected();
    if (task && window.confirm(`Delete “${task.title}”?`)) {
      this.mutate(this.api.remove(task.id), () => {
        this.selectedId.set(null);
        this.notice.set('Task deleted.');
      });
    }
  }

  protected async copyLink(): Promise<void> {
    const task = this.selected();
    if (!task) return;
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ task: String(task.id), date: task.date }).toString();
    try {
      await navigator.clipboard.writeText(url.toString());
      this.notice.set('Task link copied.');
    } catch {
      this.notice.set('Unable to access clipboard. Task link: ' + url.toString());
    }
  }

  private mutate<T>(request: Observable<T>, success: (value: T) => void): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.mutationError.set('');
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => {
        this.saving.set(false);
        success(value);
        this.resource.reload();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.mutationError.set(
          error instanceof HttpErrorResponse && error.status === 404
            ? 'This task no longer exists. Refresh the calendar.'
            : 'Could not save changes. Check the API/database connection and try again.',
        );
      },
    });
  }
}
