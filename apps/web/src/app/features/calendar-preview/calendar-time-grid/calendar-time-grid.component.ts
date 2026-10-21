import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TerraCalendarDayHeader, TerraNowIndicator, TerraTaskBlock } from 'terra-ui';
import { DatePipe } from '@angular/common';
import { CalendarTask, TimeSlot } from '../calendar-preview.models';
import { CALENDAR_WEEKDAYS, CALENDAR_HOURS } from '../calendar-preview.data';
import { calendarDayDate, dateKey, formatCalendarTime } from '../calendar-preview.utils';
@Component({
  selector: 'app-calendar-time-grid',
  imports: [DatePipe, TerraCalendarDayHeader, TerraNowIndicator, TerraTaskBlock],
  templateUrl: './calendar-time-grid.component.html',
  styleUrl: './calendar-time-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarTimeGridComponent {
  private readonly calendarScroll = viewChild.required<ElementRef<HTMLElement>>('calendarScroll');
  private readonly destroyRef = inject(DestroyRef);
  private readonly now = signal(new Date());
  protected readonly nowMarker = computed(() => {
    const now = this.now();
    const day = this.visibleDays().find((day) => dateKey(this.dayDate(day)) === dateKey(now));
    if (day === undefined) return null;
    const hour = now.getHours() + now.getMinutes() / 60;
    return { day, top: hour * 64, label: `Current time ${formatCalendarTime(hour)}` };
  });
  readonly tasks = input.required<readonly CalendarTask[]>();
  readonly dayView = input(false);
  readonly selectedId = input<number | null>(null);
  readonly activeDay = input.required<number>();
  readonly offset = input.required<number>();
  readonly daySelected = output<number>();
  readonly taskSelected = output<CalendarTask>();
  readonly slotSelected = output<TimeSlot>();
  // Split connected overlap groups into lanes; the library block only renders content.
  protected readonly positions = computed(() => {
    const result = new Map<number, { left: string; width: string }>();
    for (let day = 0; day < 7; day++) {
      const tasks = this.tasks()
        .filter((task) => task.day === day && task.scheduled !== false)
        .sort((a, b) => a.start - b.start || a.id - b.id);
      let group: { task: CalendarTask; lane: number }[] = [];
      let laneEnds: number[] = [];
      let groupEnd = -Infinity;
      const flush = () => {
        for (const { task, lane } of group)
          result.set(task.id, {
            left: `calc(${(lane * 100) / laneEnds.length}% + 6px)`,
            width: `calc(${100 / laneEnds.length}% - 12px)`,
          });
        group = [];
        laneEnds = [];
        groupEnd = -Infinity;
      };
      for (const task of tasks) {
        if (task.start >= groupEnd) flush();
        let lane = laneEnds.findIndex((end) => end <= task.start);
        if (lane === -1) lane = laneEnds.length;
        const end = task.start + task.duration;
        laneEnds[lane] = end;
        groupEnd = Math.max(groupEnd, end);
        group.push({ task, lane });
      }
      flush();
    }
    return result;
  });
  protected readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  protected readonly weekdays = CALENDAR_WEEKDAYS;
  protected readonly hours = CALENDAR_HOURS;
  protected readonly time = formatCalendarTime;
  constructor() {
    afterNextRender(() => {
      this.calendarScroll().nativeElement.scrollTop = 7 * 64;
      // Start only in the browser, and release the clock when the grid is destroyed.
      this.now.set(new Date());
      const clock = setInterval(() => this.now.set(new Date()), 60_000);
      this.destroyRef.onDestroy(() => clearInterval(clock));
    });
  }

  protected readonly visibleDays = computed(() =>
    this.dayView() ? [this.activeDay()] : [0, 1, 2, 3, 4, 5, 6],
  );
  protected dayDate(day: number): Date {
    return calendarDayDate(this.offset(), day);
  }
}
