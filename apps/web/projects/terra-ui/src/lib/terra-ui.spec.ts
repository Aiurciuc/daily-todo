import { Component, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  TerraButton,
  TerraField,
  TerraCheckbox,
  TerraRadioCard,
  TerraSegmentedFilter,
  TerraTaskBlock,
  TerraCalendarDayHeader,
  TerraMiniCalendarWidget,
  TerraTaskInspectorCard,
  TerraUrgentTaskRow,
  TerraModal,
} from '../public-api';

@Component({
  imports: [TerraButton, TerraField, TerraCheckbox, TerraRadioCard],
  template: `<form (submit)="$event.preventDefault(); submitted = true">
    <button terraButton variant="secondary" size="compact">Add</button>
    <button terraButton type="submit">Save</button>
    <label for="title">Title</label><input id="title" terraField [invalid]="invalid" />
    <label terraRadioCard
      ><input terraCheckbox type="radio" name="visibility" value="shared" />Shared</label
    >
    <label terraRadioCard
      ><input terraCheckbox type="radio" name="visibility" value="private" />Private</label
    >
  </form>`,
})
class FormHost {
  submitted = false;
  invalid = true;
}

describe('Terra UI', () => {
  async function render<T>(component: Type<T>, inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(component);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    await fixture.whenStable();
    return {
      fixture,
      element: fixture.nativeElement as HTMLElement,
      component: fixture.componentInstance,
    };
  }

  it('keeps native form semantics, safe button defaults, and invalid field state', async () => {
    const { fixture, element, component } = await render(FormHost);
    const buttons = element.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0].type).toBe('button');
    expect(buttons[0].dataset['variant']).toBe('secondary');
    expect(buttons[0].dataset['size']).toBe('compact');
    buttons[0].click();
    expect(component.submitted).toBe(false);
    buttons[1].click();
    expect(component.submitted).toBe(true);
    expect(element.querySelector('#title')?.getAttribute('aria-invalid')).toBe('true');
    component.invalid = false;
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(element.querySelector('#title')?.getAttribute('aria-invalid')).toBeNull();
  });

  it('uses native mutually exclusive radio controls', async () => {
    const { element } = await render(FormHost);
    const radios = element.querySelectorAll<HTMLInputElement>('input[type=radio]');
    radios[0].click();
    radios[1].click();
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(true);
    expect(radios[1].classList.contains('terra-checkbox')).toBe(true);
  });

  it('renders controlled segmented selection, counts, and typed events', async () => {
    const { fixture, element, component } = await render(TerraSegmentedFilter, {
      label: 'Visibility',
      value: 'All',
      variant: 'pills',
      options: [
        { value: 'All', label: 'All' },
        { value: 'Shared', label: 'Shared', count: 3 },
      ],
    });
    const selected = vi.fn();
    component.valueChanged.subscribe(selected);
    const buttons = element.querySelectorAll<HTMLButtonElement>('button');
    expect(element.getAttribute('aria-label')).toBe('Visibility');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].textContent).toContain('3');
    buttons[1].click();
    expect(selected).toHaveBeenCalledWith('Shared');
    fixture.componentRef.setInput('value', 'Shared');
    await fixture.whenStable();
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('disables individual segments and entire groups', async () => {
    const { fixture, element, component } = await render(TerraSegmentedFilter, {
      label: 'View',
      value: 'Day',
      options: [
        { value: 'Day', label: 'Day' },
        { value: 'Week', label: 'Week', disabled: true },
      ],
    });
    const changed = vi.fn();
    component.valueChanged.subscribe(changed);
    const buttons = element.querySelectorAll<HTMLButtonElement>('button');
    buttons[1].click();
    expect(changed).not.toHaveBeenCalled();
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    expect(buttons[0].disabled).toBe(true);
  });

  it('renders shared, selected, completed task states and activation', async () => {
    const { fixture, element, component } = await render(TerraTaskBlock, {
      taskTitle: 'Design review',
      timeLabel: '09:00 – 10:00',
      shared: true,
      selected: true,
      completed: true,
    });
    const activated = vi.fn();
    component.activated.subscribe(activated);
    const button = element.querySelector('button')!;
    expect(button.classList.contains('shared')).toBe(true);
    expect(button.classList.contains('selected')).toBe(true);
    expect(button.classList.contains('completed')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    expect(activated).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    button.click();
    expect(activated).toHaveBeenCalledOnce();
  });

  it('renders private task context without implying sharing', async () => {
    const { element } = await render(TerraTaskBlock, {
      taskTitle: 'Focus',
      timeLabel: '11:00',
      shared: false,
    });
    expect(element.querySelector('button')?.getAttribute('aria-label')).toContain('Private');
    expect(element.textContent).toContain('lock');
  });

  it('emits day selection and exposes the highlighted state', async () => {
    const { element, component } = await render(TerraCalendarDayHeader, {
      weekday: 'Tue',
      day: 21,
      active: true,
      accessibleLabel: 'Tuesday, October 21',
    });
    const selected = vi.fn();
    component.selected.subscribe(selected);
    const button = element.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Tuesday, October 21');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    expect(selected).toHaveBeenCalledOnce();
  });

  it('renders mini-calendar date states and emits dates/navigation', async () => {
    const date = new Date(2024, 9, 21);
    const { element, component } = await render(TerraMiniCalendarWidget, {
      month: date,
      cells: [
        { date, current: true, selected: true, inRange: true },
        { date: new Date(2024, 8, 30), current: false, disabled: true },
      ],
    });
    const changed = vi.fn(),
      moved = vi.fn();
    component.dateSelected.subscribe(changed);
    component.monthMoved.subscribe(moved);
    const days = element.querySelectorAll<HTMLButtonElement>('.mini-days button');
    expect(days[0].classList.contains('selected')).toBe(true);
    expect(days[0].getAttribute('aria-label')).toContain('October 21');
    days[0].click();
    expect(changed).toHaveBeenCalledWith(date);
    days[1].click();
    expect(changed).toHaveBeenCalledOnce();
    element.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.click();
    expect(moved).toHaveBeenCalledWith(1);
  });

  it('renders inspector metadata and emits actions', async () => {
    const { element, component } = await render(TerraTaskInspectorCard, {
      task: {
        title: 'Review',
        timeLabel: '14:00',
        dateLabel: 'Today',
        shared: true,
        completed: true,
        notes: 'Agenda',
      },
    });
    const completed = vi.fn(),
      edited = vi.fn(),
      linked = vi.fn();
    component.completionToggled.subscribe(completed);
    component.editRequested.subscribe(edited);
    component.linkRequested.subscribe(linked);
    expect(element.textContent).toContain('Agenda');
    expect(element.textContent).not.toContain('Attendees');
    expect(element.textContent).not.toContain('Join Call');
    expect(element.querySelector('.project')).toBeNull();
    expect(element.textContent).toContain('Reopen task');
    element.querySelector<HTMLButtonElement>('.detail-actions button')!.click();
    expect(completed).toHaveBeenCalledOnce();
    element.querySelector<HTMLButtonElement>('[aria-label="Edit task"]')!.click();
    expect(edited).toHaveBeenCalledOnce();
    element.querySelector<HTMLButtonElement>('[aria-label="Copy task link"]')!.click();
    expect(linked).toHaveBeenCalledOnce();
  });

  it('supplies empty notes fallback for private tasks', async () => {
    const { element } = await render(TerraTaskInspectorCard, {
      task: {
        title: 'Private',
        timeLabel: '11:00',
        dateLabel: 'Today',
        shared: false,
      },
    });
    expect(element.textContent).toContain('No notes added.');
  });

  it('renders urgency and emits row selection', async () => {
    const { element, component } = await render(TerraUrgentTaskRow, {
      taskTitle: 'Review',
      category: 'Shared sync',
      deadline: 'In 3h',
      urgent: true,
      shared: true,
    });
    const activated = vi.fn();
    component.activated.subscribe(activated);
    expect(element.querySelector('.deadline')?.textContent).toBe('In 3h');
    element.querySelector('button')!.click();
    expect(activated).toHaveBeenCalledOnce();
  });

  it('delegates modal focus trapping, Escape, and close events to native dialog', async () => {
    const { element, component } = await render(TerraModal, { label: 'New task' });
    const dialog = element.querySelector('dialog')!;
    dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
    dialog.close = vi.fn();
    const closed = vi.fn();
    component.closed.subscribe(closed);
    component.open();
    component.open();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    component.close();
    expect(dialog.close).toHaveBeenCalledOnce();
    dialog.dispatchEvent(new Event('close'));
    expect(closed).toHaveBeenCalledOnce();
    expect(dialog.getAttribute('aria-label')).toBe('New task');
  });
});
