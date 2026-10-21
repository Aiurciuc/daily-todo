import { TestBed } from '@angular/core/testing';
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
    expect(blocks[0].style.width).toBe('calc(50% - 12px)');
    expect(blocks[1].style.left).toBe('calc(50% + 6px)');
    expect(blocks[0].querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(blocks[1].querySelector('button')?.classList.contains('compact')).toBe(true);
    expect(blocks[1].textContent).toContain('Quick sync');
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
