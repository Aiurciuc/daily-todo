import { TestBed } from '@angular/core/testing';
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
  async function render() {
    const fixture = TestBed.createComponent(CalendarTimeGridComponent);
    fixture.componentRef.setInput('tasks', [task]);
    fixture.componentRef.setInput('activeDay', 0);
    fixture.componentRef.setInput('offset', 0);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element };
  }

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
