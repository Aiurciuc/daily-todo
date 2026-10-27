import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TerraCalendarDayHeader, TerraNowIndicator, TerraTaskBlock } from 'terra-ui';
import { DatePipe } from '@angular/common';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragStart,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { CalendarTask, CalendarTaskMove, TimeSlot } from '../calendar-preview.models';
import { CALENDAR_WEEKDAYS, CALENDAR_HOURS } from '../calendar-preview.data';
import { calendarDayDate, dateKey, formatCalendarTime } from '../calendar-preview.utils';
interface CalendarDropZone {
  day: number;
  kind: string;
}

@Component({
  selector: 'app-calendar-time-grid',
  imports: [
    DatePipe,
    TerraCalendarDayHeader,
    TerraNowIndicator,
    TerraTaskBlock,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    CdkScrollable,
  ],
  templateUrl: './calendar-time-grid.component.html',
  styleUrl: './calendar-time-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarTimeGridComponent {
  private readonly calendarScroll = viewChild.required<ElementRef<HTMLElement>>('calendarScroll');
  private readonly destroyRef = inject(DestroyRef);
  private readonly now = signal(new Date());
  readonly nowMarker = computed(() => {
    const now = this.now();
    const day = this.visibleDays().find((day) => dateKey(this.dayDate(day)) === dateKey(now));
    if (day === undefined) return null;
    const hour = now.getHours() + now.getMinutes() / 60;
    return { day, top: hour * 64, label: `Current time ${formatCalendarTime(hour)}` };
  });
  readonly tasks = input.required<readonly CalendarTask[]>();
  readonly dayView = input(false);
  readonly interactionDisabled = input(false);
  readonly taskMoved = output<CalendarTaskMove>();
  private dragState: {
    source: CdkDrag<number>;
    task: CalendarTask;
    zone: CalendarDropZone;
    offset: number;
    dayView: boolean;
    activeDay: number;
    grabOffset: number;
  } | null = null;
  private suppressClickUntil = 0;
  private pickup: { id: number; grabOffset: number } | null = null;
  readonly selectedId = input<number | null>(null);
  readonly activeDay = input.required<number>();
  readonly offset = input.required<number>();
  readonly daySelected = output<number>();
  readonly taskSelected = output<CalendarTask>();
  readonly slotSelected = output<TimeSlot>();
  // Split connected overlap groups into lanes; the library block only renders content.
  readonly positions = computed(() => {
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
  readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly weekdays = CALENDAR_WEEKDAYS;
  readonly hours = CALENDAR_HOURS;
  readonly time = formatCalendarTime;
  constructor() {
    effect(() => {
      // A destroyed CDK drag does not emit ended. Navigation/filtering must not
      // leave click suppression active forever or accept a stale drop.
      const tasks = this.tasks();
      const offset = this.offset();
      const dayView = this.dayView();
      const activeDay = this.activeDay();
      const state = this.dragState;
      if (
        state &&
        (tasks.find((task) => task.id === state.task.id) !== state.task ||
          offset !== state.offset ||
          dayView !== state.dayView ||
          activeDay !== state.activeDay)
      ) {
        this.dragState = null;
        this.pickup = null;
        this.suppressClickUntil = Date.now() + 300;
      }
    });
    afterNextRender(() => {
      this.calendarScroll().nativeElement.scrollTop = 7 * 64;
      // Start only in the browser, and release the clock when the grid is destroyed.
      this.now.set(new Date());
      const clock = setInterval(() => this.now.set(new Date()), 60_000);
      this.destroyRef.onDestroy(() => clearInterval(clock));
    });
  }

  readonly visibleDays = computed(() =>
    this.dayView() ? [this.activeDay()] : [0, 1, 2, 3, 4, 5, 6],
  );
  readonly untimedDays = computed(() =>
    this.visibleDays().map((day) => ({
      day,
      tasks: this.tasks().filter((task) => task.day === day && task.scheduled === false),
    })),
  );

  readonly canEnter = (
    drag: CdkDrag<number>,
    list: CdkDropList<CalendarDropZone>,
  ): boolean => this.validDrag(drag) && this.validZone(list.data);

  private validZone(zone: CalendarDropZone): boolean {
    return (
      !!zone &&
      (zone.kind === 'timeline' || zone.kind === 'untimed') &&
      Number.isInteger(zone.day) &&
      zone.day >= 0 &&
      zone.day < 7 &&
      this.visibleDays().includes(zone.day)
    );
  }

  private validDrag(source: CdkDrag<number>): boolean {
    const state = this.dragState;
    const task = this.tasks().find((task) => task.id === source.data);
    return (
      !this.interactionDisabled() &&
      !!state &&
      state.source === source &&
      task === state.task &&
      task.canEdit !== false &&
      this.offset() === state.offset &&
      this.dayView() === state.dayView &&
      this.activeDay() === state.activeDay &&
      this.validZone(state.zone) &&
      task.day === state.zone.day &&
      (task.scheduled === false ? 'untimed' : 'timeline') === state.zone.kind
    );
  }

  capturePickup(event: PointerEvent, element: HTMLElement, task: CalendarTask): void {
    this.pickup = { id: task.id, grabOffset: event.clientY - element.getBoundingClientRect().top };
  }

  dragStarted(event: CdkDragStart<number>): void {
    const source = event.source;
    const task = this.tasks().find((task) => task.id === source.data);
    const zone = source.dropContainer.data as CalendarDropZone;
    this.suppressClickUntil = Infinity;
    if (!task || task.canEdit === false || this.interactionDisabled() || !this.validZone(zone)) {
      this.dragState = null;
      return;
    }
    const pointer = 'touches' in event.event ? event.event.touches[0] : event.event;
    // CDK has already moved the host to the body when started fires. Its
    // placeholder retains the original, scroll-adjusted position in the grid.
    const sourceElement = source.getPlaceholderElement() ?? source.element.nativeElement;
    this.dragState = {
      source,
      task,
      zone: { ...zone },
      offset: this.offset(),
      dayView: this.dayView(),
      activeDay: this.activeDay(),
      // started's event has already crossed the drag threshold; the pickup
      // offset must come from pointer-down, before any vertical movement.
      grabOffset:
        this.pickup?.id === task.id
          ? this.pickup.grabOffset
          : pointer.clientY - sourceElement.getBoundingClientRect().top,
    };
  }

  dropTask(event: CdkDragDrop<CalendarDropZone, CalendarDropZone, number>): void {
    try {
      if (
        !event.isPointerOverContainer ||
        !this.validDrag(event.item) ||
        !this.validZone(event.container.data)
      )
        return;
      const state = this.dragState!;
      if (
        event.previousContainer !== event.item.dropContainer ||
        event.previousContainer.data.day !== state.zone.day ||
        event.previousContainer.data.kind !== state.zone.kind
      )
        return;
      const task = state.task;
      const { day, kind } = event.container.data;
      let startMinute: number | null = null;
      if (kind === 'timeline') {
        const duration = task.scheduled === false ? 60 : task.duration * 60;
        if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) return;
        const rect = event.container.element.nativeElement.getBoundingClientRect();
        const minute = ((event.dropPoint.y - rect.top - state.grabOffset) * 60) / 64;
        if (!Number.isFinite(minute)) return;
        startMinute = Math.max(0, Math.min(1440 - duration, Math.round(minute / 15) * 15));
      }
      const previousMinute = task.scheduled === false ? null : Math.round(task.start * 60);
      if (day === task.day && startMinute === previousMinute) return;
      this.taskMoved.emit({ id: task.id, day, startMinute });
    } finally {
      event.item.reset();
    }
  }

  dragEnded(source: CdkDrag<number>): void {
    source.reset();
    // CDK emits ended before dropped; retain validation state through this turn.
    const state = this.dragState;
    queueMicrotask(() => {
      if (this.dragState === state) this.dragState = null;
    });
    this.pickup = null;
    this.suppressClickUntil = Date.now() + 300;
  }

  selectTask(task: CalendarTask): void {
    if (Date.now() >= this.suppressClickUntil) this.taskSelected.emit(task);
  }

  selectSlot(day: number, hour: number): void {
    if (Date.now() >= this.suppressClickUntil) this.slotSelected.emit({ day, hour });
  }

  dayDate(day: number): Date {
    return calendarDayDate(this.offset(), day);
  }
}
