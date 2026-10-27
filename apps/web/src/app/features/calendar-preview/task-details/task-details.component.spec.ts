import { TestBed } from '@angular/core/testing';
import { CalendarTask } from '../calendar-preview.models';
import { TaskDetailsComponent } from './task-details.component';

const task: CalendarTask = {
  id: 1,
  title: 'Planning',
  date: '2026-10-26',
  day: 0,
  start: 9,
  duration: 1,
  shared: false,
};

describe('TaskDetailsComponent duration', () => {
  it.each([
    [1, '1 min'],
    [30, '30 min'],
    [47, '47 min'],
    [59, '59 min'],
    [60, '1h'],
    [80, '1h 20 min'],
    [120, '2h'],
    [135, '2h 15 min'],
  ])('displays %i minutes as %s in the time row', async (minutes, label) => {
    const fixture = TestBed.createComponent(TaskDetailsComponent);
    fixture.componentRef.setInput('task', { ...task, duration: minutes / 60 });
    fixture.componentRef.setInput('selectedDate', new Date(2026, 9, 26));
    await fixture.whenStable();
    const time = fixture.nativeElement.querySelector('.time') as HTMLElement;
    expect(time.textContent).toContain(`(${label})`);
    expect(time.textContent).toContain('09:00');
  });

  it('keeps unscheduled tasks without a duration', async () => {
    const fixture = TestBed.createComponent(TaskDetailsComponent);
    fixture.componentRef.setInput('task', { ...task, scheduled: false, duration: 0 });
    fixture.componentRef.setInput('selectedDate', new Date(2026, 9, 26));
    await fixture.whenStable();
    const time = fixture.nativeElement.querySelector('.time') as HTMLElement;
    expect(time.textContent).toContain('Unscheduled');
    expect(time.textContent).not.toContain(' min');
    expect(time.textContent).not.toContain('(');
  });
});
