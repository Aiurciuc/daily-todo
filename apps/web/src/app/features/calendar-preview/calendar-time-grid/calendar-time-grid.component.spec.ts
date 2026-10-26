import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { afterEach, beforeEach, vi } from 'vitest';
import { CalendarTimeGridComponent } from './calendar-time-grid.component';
import { CalendarTask, TimeSlot } from '../calendar-preview.models';

const task: CalendarTask = {
  id: 1,
  date: '2026-10-12',
  title: 'Planning',
  day: 0,
  start: 9,
  duration: 1,
  shared: true,
};

describe('CalendarTimeGridComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 9, 14, 10, 30)); // Wednesday, local calendar time.
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  async function render() {
    const fixture = TestBed.createComponent(CalendarTimeGridComponent);
    fixture.componentRef.setInput('tasks', [task]);
    fixture.componentRef.setInput('activeDay', 0);
    fixture.componentRef.setInput('offset', 0);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element };
  }

  it('shows the current-time bar only in today’s column at the correct minute', async () => {
    const { element } = await render();
    const markers = element.querySelectorAll<HTMLElement>('terra-now-indicator');
    expect(markers).toHaveLength(1);
    expect(markers[0].parentElement).toBe(element.querySelectorAll('.day-column')[2]);
    expect(markers[0].style.top).toBe('672px');
    expect(markers[0].getAttribute('aria-label')).toBe('Current time 10:30');
  });

  it('updates the bar every minute and stops the clock on destruction', async () => {
    const { fixture, element } = await render();
    vi.advanceTimersByTime(60_000);
    await fixture.whenStable();
    const marker = element.querySelector<HTMLElement>('terra-now-indicator')!;
    expect(marker.style.top).toBe(`${(10 + 31 / 60) * 64}px`);
    expect(marker.getAttribute('aria-label')).toBe('Current time 10:31');
    expect(vi.getTimerCount()).toBe(1);
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hides the bar outside the current week and on other days in Day view', async () => {
    const { fixture, element } = await render();
    fixture.componentRef.setInput('offset', 1);
    await fixture.whenStable();
    expect(element.querySelector('terra-now-indicator')).toBeNull();
    fixture.componentRef.setInput('offset', -1);
    await fixture.whenStable();
    expect(element.querySelector('terra-now-indicator')).toBeNull();
    fixture.componentRef.setInput('offset', 0);
    fixture.componentRef.setInput('dayView', true);
    await fixture.whenStable();
    expect(element.querySelector('terra-now-indicator')).toBeNull();
    fixture.componentRef.setInput('activeDay', 2);
    await fixture.whenStable();
    expect(element.querySelectorAll('terra-now-indicator')).toHaveLength(1);
  });

  it('moves the bar to the next day at midnight', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 23, 59));
    const { fixture, element } = await render();
    vi.advanceTimersByTime(60_000);
    await fixture.whenStable();
    const marker = element.querySelector<HTMLElement>('terra-now-indicator')!;
    expect(marker.parentElement).toBe(element.querySelectorAll('.day-column')[3]);
    expect(marker.style.top).toBe('0px');
    expect(marker.getAttribute('aria-label')).toBe('Current time 00:00');
  });

  it('opens with the timeline scrolled to 07:00', async () => {
    const { element } = await render();
    expect(element.querySelector<HTMLElement>('.calendar-scroll')?.scrollTop).toBe(7 * 64);
  });

  it('emits task and slot selections without owning calendar state', async () => {
    const { fixture, element } = await render();
    const selectedTasks: CalendarTask[] = [];
    const selectedSlots: TimeSlot[] = [];
    fixture.componentInstance.taskSelected.subscribe((value) => selectedTasks.push(value));
    fixture.componentInstance.slotSelected.subscribe((value) => selectedSlots.push(value));

    element.querySelector<HTMLButtonElement>('.calendar-task')!.click();
    element.querySelector<HTMLButtonElement>('[aria-label="Block time on Mon at 00:00"]')!.click();
    await fixture.whenStable();

    expect(selectedTasks).toEqual([task]);
    expect(selectedSlots).toEqual([{ day: 0, hour: 0 }]);
    expect(element.querySelectorAll('.calendar-task')).toHaveLength(1);
  });

  it('passes selection to blocks and gives overlapping tasks separate lanes', async () => {
    const { fixture, element } = await render();
    fixture.componentRef.setInput('selectedId', 1);
    fixture.componentRef.setInput('tasks', [
      task,
      { ...task, id: 2, start: 9.5, duration: 0.5, title: 'Quick sync' },
    ]);
    await fixture.whenStable();
    const blocks = element.querySelectorAll<HTMLElement>('terra-task-block');
    const lanes = element.querySelectorAll<HTMLElement>('.positioned-task');
    expect(lanes[0].style.width).toBe('calc(50% - 12px)');
    expect(lanes[1].style.left).toBe('calc(50% + 6px)');
    expect(blocks[0].querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(blocks[1].querySelector('button')?.classList.contains('compact')).toBe(true);
    expect(blocks[1].textContent).toContain('Quick sync');
  });

  it('groups untimed tasks above their own day, never in an hourly slot', async () => {
    const { fixture, element } = await render();
    const monday = {
      ...task,
      id: 2,
      title: 'Monday anytime',
      scheduled: false,
      start: 0,
      duration: 0,
    };
    const wednesday = {
      ...monday,
      id: 3,
      day: 2,
      date: '2026-10-14',
      title: 'Wednesday anytime',
      completed: true,
    };
    fixture.componentRef.setInput('tasks', [
      task,
      monday,
      wednesday,
      { ...monday, id: 4, day: 7, title: 'Outside week' },
    ]);
    fixture.componentRef.setInput('selectedId', 3);
    await fixture.whenStable();
    const columns = element.querySelectorAll('.untimed-day');
    expect(columns).toHaveLength(7);
    expect(columns[0].textContent).toContain('Monday anytime');
    expect(columns[1].querySelector('terra-task-block')).toBeNull();
    expect(columns[2].textContent).toContain('Wednesday anytime');
    expect(columns[2].getAttribute('aria-label')).toContain('Wednesday, October 14, 2026');
    const button = columns[2].querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains('completed')).toBe(true);
    expect(element.textContent).not.toContain('Outside week');
    expect(element.querySelectorAll('.calendar-body terra-task-block')).toHaveLength(1);
    const selected: CalendarTask[] = [];
    fixture.componentInstance.taskSelected.subscribe((value) => selected.push(value));
    button.click();
    expect(selected).toEqual([wednesday]);
  });

  it('keeps only the active day’s untimed tasks in Day view and reacts to date changes', async () => {
    const { fixture, element } = await render();
    fixture.componentRef.setInput('tasks', [
      { ...task, id: 2, title: 'Monday anytime', scheduled: false },
      { ...task, id: 3, day: 2, title: 'Wednesday anytime', scheduled: false },
    ]);
    fixture.componentRef.setInput('dayView', true);
    await fixture.whenStable();
    expect(element.querySelectorAll('.untimed-day')).toHaveLength(1);
    expect(element.querySelector('.unscheduled-tasks')?.textContent).toContain('Monday anytime');
    expect(element.textContent).not.toContain('Wednesday anytime');
    fixture.componentRef.setInput('activeDay', 2);
    await fixture.whenStable();
    expect(element.querySelector('.unscheduled-tasks')?.textContent).toContain('Wednesday anytime');
    expect(element.textContent).not.toContain('Monday anytime');
    fixture.componentRef.setInput('tasks', [task]);
    await fixture.whenStable();
    expect(element.querySelectorAll('.untimed-task')).toHaveLength(0);
  });

  it('moves tasks between the untimed strip and the hourly grid when their time changes', async () => {
    const { fixture, element } = await render();
    expect(element.querySelectorAll('.untimed-task')).toHaveLength(0);
    fixture.componentRef.setInput('tasks', [{ ...task, scheduled: false, start: 0, duration: 0 }]);
    await fixture.whenStable();
    expect(element.querySelectorAll('.untimed-task')).toHaveLength(1);
    expect(element.querySelector('.positioned-task')).toBeNull();
    fixture.componentRef.setInput('tasks', [{ ...task, scheduled: true }]);
    await fixture.whenStable();
    expect(element.querySelectorAll('.untimed-task')).toHaveLength(0);
    expect(element.querySelectorAll('.positioned-task')).toHaveLength(1);
  });

  async function dragging() {
    const rendered = await render();
    const { fixture } = rendered;
    const dragElement = fixture.debugElement.query(By.directive(CdkDrag));
    const drag = dragElement.injector.get(CdkDrag);
    const reset = vi.spyOn(drag, 'reset');
    vi.spyOn(drag.element.nativeElement, 'getBoundingClientRect').mockReturnValue({
      top: 200,
    } as DOMRect);
    const zones = fixture.debugElement.queryAll(By.directive(CdkDropList));
    const start = () =>
      dragElement.triggerEventHandler('cdkDragStarted', {
        source: drag,
        event: new MouseEvent('mousedown', { clientY: 216 }),
      });
    const moves: { id: number; day: number; startMinute: number | null }[] = [];
    fixture.componentInstance.taskMoved.subscribe((move) => moves.push(move));
    const drop = (day: number, kind = 'timeline', minute = 600, inside = true) => {
      const zone = zones.find((el) => {
        const data = el.injector.get(CdkDropList).data;
        return data.day === day && data.kind === kind;
      })!;
      const container = zone.injector.get(CdkDropList);
      // A negative viewport top models scrolling; drop must use current target geometry.
      vi.spyOn(container.element.nativeElement, 'getBoundingClientRect').mockReturnValue({
        top: -300,
      } as DOMRect);
      zone.triggerEventHandler('cdkDropListDropped', {
        item: drag,
        container,
        previousContainer: drag.dropContainer,
        isPointerOverContainer: inside,
        dropPoint: { x: 0, y: -300 + (minute * 64) / 60 + 16 },
        previousIndex: 999,
        currentIndex: 999,
      });
    };
    return { ...rendered, drag, dragElement, reset, start, drop, moves };
  }

  it('connects stable task ids and empty untimed zones with sorting disabled', async () => {
    const { fixture, drag } = await dragging();
    expect(fixture.debugElement.query(By.directive(CdkDropListGroup))).not.toBeNull();
    expect(drag.data).toBe(task.id);
    const lists = fixture.debugElement.queryAll(By.directive(CdkDropList));
    expect(lists).toHaveLength(14);
    expect(lists.every((el) => el.injector.get(CdkDropList).sortingDisabled)).toBe(true);
  });

  it('snaps using the grab offset and scrolled target, without changing task data or layout', async () => {
    const { start, drop, moves, reset, element } = await dragging();
    start();
    drop(2, 'timeline', 608);
    expect(moves).toEqual([{ id: 1, day: 2, startMinute: 615 }]);
    expect(reset).toHaveBeenCalled();
    expect(task.start).toBe(9);
    expect(element.querySelector<HTMLElement>('.positioned-task')!.style.top).toBe('576px');
    // CDK clears inline top/left on the drag root; keep those bindings on its wrapper.
    const root = element.querySelector<HTMLElement>('.timed-drag')!;
    expect(root.style.top).toBe('');
    expect(root.style.left).toBe('');
    expect(root.parentElement?.classList.contains('positioned-task')).toBe(true);
  });

  it('uses the original placeholder geometry after CDK moves the host to the body', async () => {
    const { start, drop, moves, drag } = await dragging();
    const placeholder = document.createElement('div');
    vi.spyOn(placeholder, 'getBoundingClientRect').mockReturnValue({ top: 200 } as DOMRect);
    vi.spyOn(drag, 'getPlaceholderElement').mockReturnValue(placeholder);
    vi.mocked(drag.element.nativeElement.getBoundingClientRect).mockReturnValue({
      top: 0,
    } as DOMRect);
    start();
    drop(1, 'timeline', 600);
    expect(moves).toEqual([{ id: 1, day: 1, startMinute: 600 }]);
  });

  it('uses pointer-down pickup rather than the movement crossing the drag threshold', async () => {
    const { dragElement, drag, drop, moves } = await dragging();
    dragElement.triggerEventHandler('pointerdown', { clientY: 216 });
    dragElement.triggerEventHandler('cdkDragStarted', {
      source: drag,
      event: new MouseEvent('mousemove', { clientY: 248 }),
    });
    drop(1, 'timeline', 600);
    expect(moves).toEqual([{ id: 1, day: 1, startMinute: 600 }]);
  });

  it('restores clicks if filtering destroys a drag without an ended event', async () => {
    const { fixture, element, start, moves } = await dragging();
    const slot = vi.fn();
    fixture.componentInstance.slotSelected.subscribe(slot);
    start();
    fixture.componentRef.setInput('tasks', []);
    await fixture.whenStable();
    vi.setSystemTime(Date.now() + 301);
    element.querySelector<HTMLButtonElement>('.hour-slot')!.click();
    expect(slot).toHaveBeenCalledWith({ day: 0, hour: 0 });
    expect(moves).toEqual([]);
  });

  it('validates target days, source zones, duration and navigation changes', async () => {
    const { fixture, start, drop, drag, moves } = await dragging();
    start();
    const sourceData = drag.dropContainer.data;
    drag.dropContainer.data = { day: 7, kind: 'timeline' };
    drop(1);
    drag.dropContainer.data = sourceData;
    const target = fixture.debugElement
      .queryAll(By.directive(CdkDropList))
      .find((el) => el.injector.get(CdkDropList).data.kind === 'timeline')!;
    const list = target.injector.get(CdkDropList);
    expect(list.enterPredicate(drag, list)).toBe(true);
    const data = list.data;
    list.data = { day: -1, kind: 'timeline' };
    target.triggerEventHandler('cdkDropListDropped', {
      item: drag,
      container: list,
      previousContainer: drag.dropContainer,
      isPointerOverContainer: true,
    });
    expect(list.enterPredicate(drag, list)).toBe(false);
    list.data = data;
    fixture.componentRef.setInput('offset', 1);
    await fixture.whenStable();
    drop(1);
    fixture.componentRef.setInput('tasks', [{ ...task, duration: 25 }]);
    await fixture.whenStable();
    start();
    drop(1);
    expect(moves).toEqual([]);
  });

  it('retains validation through CDK ended-before-dropped ordering', async () => {
    const { start, dragElement, drag, drop, moves } = await dragging();
    start();
    dragElement.triggerEventHandler('cdkDragEnded', { source: drag });
    drop(1);
    expect(moves).toEqual([{ id: 1, day: 1, startMinute: 600 }]);
    await Promise.resolve();
    drop(2);
    expect(moves).toHaveLength(1);
  });

  it('clamps the whole duration within the day', async () => {
    const { start, drop, moves } = await dragging();
    start();
    drop(1, 'timeline', -120);
    drop(1, 'timeline', 1500);
    expect(moves.map((move) => move.startMinute)).toEqual([0, 1380]);
  });

  it('emits null when moving to untimed, and defaults untimed duration to an hour', async () => {
    const { fixture, start, drop, moves } = await dragging();
    start();
    drop(2, 'untimed');
    expect(moves).toEqual([{ id: 1, day: 2, startMinute: null }]);
    fixture.componentRef.setInput('tasks', [{ ...task, scheduled: false, duration: 0 }]);
    await fixture.whenStable();
    const el = fixture.debugElement.query(By.directive(CdkDrag));
    const drag = el.injector.get(CdkDrag);
    vi.spyOn(drag.element.nativeElement, 'getBoundingClientRect').mockReturnValue({
      top: 200,
    } as DOMRect);
    el.triggerEventHandler('cdkDragStarted', {
      source: drag,
      event: new MouseEvent('mousedown', { clientY: 216 }),
    });
    const target = fixture.debugElement
      .queryAll(By.directive(CdkDropList))
      .find((el) => el.injector.get(CdkDropList).data.kind === 'timeline')!;
    const container = target.injector.get(CdkDropList);
    vi.spyOn(container.element.nativeElement, 'getBoundingClientRect').mockReturnValue({
      top: 0,
    } as DOMRect);
    target.triggerEventHandler('cdkDropListDropped', {
      item: drag,
      container,
      previousContainer: drag.dropContainer,
      isPointerOverContainer: true,
      dropPoint: { x: 0, y: 1600 + 16 },
    });
    expect(moves.at(-1)).toEqual({ id: 1, day: 0, startMinute: 1380 });
  });

  it('rejects no-ops, outside drops, unknown ids, and stale data and resets every drop', async () => {
    const { fixture, start, drop, moves, reset, drag } = await dragging();
    start();
    drop(0, 'timeline', 540);
    drop(1, 'timeline', 600, false);
    drag.data = 999;
    drop(1);
    drag.data = task.id;
    fixture.componentRef.setInput('tasks', [{ ...task, start: 10 }]);
    await fixture.whenStable();
    drop(1);
    expect(moves).toEqual([]);
    expect(reset).toHaveBeenCalledTimes(4);
  });

  it('disables readonly and saving interactions, including changes during a drag', async () => {
    const { fixture, start, drop, moves, drag } = await dragging();
    start();
    fixture.componentRef.setInput('interactionDisabled', true);
    await fixture.whenStable();
    expect(drag.disabled).toBe(true);
    drop(1);
    fixture.componentRef.setInput('interactionDisabled', false);
    fixture.componentRef.setInput('tasks', [{ ...task, canEdit: false }]);
    await fixture.whenStable();
    expect(drag.disabled).toBe(true);
    start();
    drop(1);
    expect(moves).toEqual([]);
  });

  it('resets cancelled drags and prevents subsequent task and slot clicks', async () => {
    const { fixture, element, start, dragElement, drag, reset } = await dragging();
    const selected = vi.fn();
    const slot = vi.fn();
    fixture.componentInstance.taskSelected.subscribe(selected);
    fixture.componentInstance.slotSelected.subscribe(slot);
    start();
    // CDK emits ended before dropped.
    dragElement.triggerEventHandler('cdkDragEnded', { source: drag });
    element.querySelector<HTMLButtonElement>('.calendar-task')!.click();
    element.querySelector<HTMLButtonElement>('.hour-slot')!.click();
    expect(reset).toHaveBeenCalled();
    expect(selected).not.toHaveBeenCalled();
    expect(slot).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 301);
    element.querySelector<HTMLButtonElement>('.calendar-task')!.click();
    expect(selected).toHaveBeenCalledWith(task);
  });

  it('reacts to day-view inputs', async () => {
    const { fixture, element } = await render();
    expect(element.querySelectorAll('.day-column')).toHaveLength(7);
    fixture.componentRef.setInput('dayView', true);
    fixture.componentRef.setInput('activeDay', 2);
    await fixture.whenStable();
    expect(element.querySelectorAll('.day-column')).toHaveLength(1);
    expect(element.querySelector('.day-heading')?.textContent).toContain('Wed');
    expect(element.querySelector('.calendar-task')).toBeNull();
  });
});
