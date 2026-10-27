import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
  DestroyRef,
} from '@angular/core';
import { CalendarHeaderComponent } from './calendar-header/calendar-header.component';
import { CalendarTimeGridComponent } from './calendar-time-grid/calendar-time-grid.component';
import { CalendarMonthViewComponent } from './calendar-month-view/calendar-month-view.component';
import { MiniCalendarComponent } from './mini-calendar/mini-calendar.component';
import { TaskDetailsComponent } from './task-details/task-details.component';
import { UrgentTasksComponent } from './urgent-tasks/urgent-tasks.component';
import { TaskDialogComponent } from './task-dialog/task-dialog.component';
import {
  CalendarTask,
  CalendarTaskMove,
  CalendarView,
  NewCalendarTask,
} from './calendar-preview.models';
import {
  buildMonthDays,
  calendarDayDate,
  dateKey,
  dateFromParts,
  dayDifference,
  localDate,
} from './calendar-preview.utils';
import { CalendarStore } from './state/calendar.store';
import { toCalendarTask } from './state/calendar-task.helpers';

@Component({
  selector: 'app-calendar-preview',
  providers: [CalendarStore],
  imports: [
    CalendarHeaderComponent,
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
  readonly store = inject(CalendarStore);
  // Mutation feedback comes from the store; clipboard feedback remains UI-local.
  readonly notice = linkedSignal(() =>
    this.store.saving() ? null : this.store.notice(),
  );
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required(TaskDialogComponent);
  readonly view = signal<CalendarView>('Week');
  readonly offset = signal(0);
  readonly activeDay = signal((new Date().getDay() + 6) % 7);
  readonly monthOffset = signal(0);
  readonly editingId = signal<number | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly rangeStart = computed(() => calendarDayDate(this.offset(), 0));
  readonly rangeEnd = computed(() => calendarDayDate(this.offset(), 6));
  readonly activeDate = computed(() => calendarDayDate(this.offset(), this.activeDay()));
  readonly miniMonth = computed(() => {
    const now = new Date();
    return dateFromParts(now.getFullYear(), now.getMonth() + this.monthOffset(), 1);
  });
  readonly monthDays = computed(() => buildMonthDays(this.miniMonth()));
  private readonly query = computed(() => {
    const cells = this.monthDays();
    const start = this.view() === 'Month' ? cells[0].date : this.rangeStart();
    const end = this.view() === 'Month' ? cells[cells.length - 1].date : this.rangeEnd();
    return {
      from: dateKey(start),
      to: dateKey(dateFromParts(end.getFullYear(), end.getMonth(), end.getDate() + 1)),
    };
  });
  readonly tasks = computed<CalendarTask[]>(() =>
    this.store.tasks().map((task) => toCalendarTask(task, this.rangeStart())),
  );
  readonly visibleTasks = computed(() =>
    this.view() === 'Day'
      ? this.tasks().filter((task) => task.day === this.activeDay())
      : this.tasks(),
  );
  readonly selected = computed(() =>
    this.tasks().find((task) => task.id === this.selectedId()),
  );
  readonly selectedDate = computed(() =>
    localDate(this.selected()?.date ?? dateKey(this.activeDate())),
  );
  private readonly clock = signal(Date.now());
  readonly urgentTasks = computed(() => {
    const now = this.clock();
    return this.tasks()
      .filter((task) => {
        if (task.completed || task.scheduled === false) return false;
        const [year, month, day] = task.date.split('-').map(Number);
        const start = new Date(year, month - 1, day, Math.floor(task.start), (task.start % 1) * 60);
        return start.getTime() >= now;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
      .slice(0, 3);
  });

  constructor() {
    const clockTimer = window.setInterval(() => this.clock.set(Date.now()), 60_000);
    this.destroyRef.onDestroy(() => window.clearInterval(clockTimer));
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && dateKey(localDate(date)) === date) {
      this.chooseDate(localDate(date));
    }
    const id = Number(params.get('task'));
    if (Number.isInteger(id) && id > 0) this.selectedId.set(id);
    this.store.setRange(this.query);
  }

  selectTask(task: CalendarTask): void {
    this.selectedId.set(task.id);
    if (task.day >= 0 && task.day < 7) this.activeDay.set(task.day);
  }

  movePeriod(direction: number): void {
    if (this.view() === 'Month') this.moveMonth(direction);
    else
      this.chooseDate(
        calendarDayDate(
          this.offset(),
          this.activeDay() + direction * (this.view() === 'Day' ? 1 : 7),
        ),
      );
  }

  moveMonth(direction: number): void {
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

  resetToday(): void {
    this.chooseDate(new Date());
  }

  chooseDate(date: Date): void {
    const days = dayDifference(date, calendarDayDate(0, 0));
    this.offset.set(Math.floor(days / 7));
    this.activeDay.set(((days % 7) + 7) % 7);
    const now = new Date();
    this.monthOffset.set(
      (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth(),
    );
  }

  openTask(day = this.activeDay(), hour = 9): void {
    if (this.store.saving()) return;
    this.editingId.set(null);
    this.store.clearMutationError();
    const date = this.view() === 'Month' ? this.miniMonth() : calendarDayDate(this.offset(), day);
    this.dialog().open(dateKey(date), hour);
  }

  editTask(): void {
    const task = this.selected();
    if (!task || task.canEdit === false || this.store.saving()) return;
    this.editingId.set(task.id);
    this.store.clearMutationError();
    this.dialog().edit(task);
  }

  saveTask(draft: NewCalendarTask): void {
    const onSaved = (task: { id: number; date: string }) => {
      this.dialog().close(true);
      this.chooseDate(localDate(task.date));
      this.selectedId.set(task.id);
    };
    const id = this.editingId();
    if (id === null) this.store.createTask(draft, onSaved);
    else this.store.updateTask(id, draft, onSaved);
  }

  moveTask(move: CalendarTaskMove): void {
    if (!Number.isInteger(move.day) || move.day < 0 || move.day > 6) return;
    const date = dateKey(calendarDayDate(this.offset(), move.day));
    if (this.store.moveTask(move.id, date, move.startMinute)) {
      this.activeDay.set(move.day);
      this.selectedId.set(move.id);
    }
  }

  toggleCompleted(): void {
    const task = this.selected();
    if (task) this.store.toggleCompleted(task.id);
  }

  deleteTask(): void {
    const task = this.selected();
    if (
      task &&
      task.canEdit !== false &&
      !this.store.saving() &&
      window.confirm(`Delete “${task.title}”?`)
    ) {
      this.store.deleteTask(task.id, () => this.selectedId.set(null));
    }
  }

  async copyLink(): Promise<void> {
    const task = this.selected();
    if (!task) return;
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ task: String(task.id), date: task.date }).toString();
    try {
      await navigator.clipboard.writeText(url.toString());
      this.notice.set({ kind: 'success', message: 'Task link copied.' });
    } catch {
      this.notice.set({
        kind: 'success',
        message: 'Unable to access clipboard. Task link: ' + url.toString(),
      });
    }
  }
}
