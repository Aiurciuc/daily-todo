import { CdkDropList } from '@angular/cdk/drag-drop';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Task } from '../task.model';
import { TaskListComponent } from './task-list.component';

const tasks: Task[] = [
  { id: 1, title: 'First', date: '2026-10-14', completed: false },
  { id: 2, title: 'Second', date: '2026-10-14', completed: true },
];

describe('TaskListComponent', () => {
  let fixture: ComponentFixture<TaskListComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(TaskListComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('tasks', tasks);
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('error', '');
    fixture.componentRef.setInput('canInteract', true);
    await fixture.whenStable();
  });

  it('renders completion and emits a toggle without mutating supplied tasks', async () => {
    const toggle = vi.fn();
    fixture.componentInstance.completionToggled.subscribe(toggle);
    const checkboxes = element.querySelectorAll<HTMLInputElement>('input');
    expect(checkboxes[1].checked).toBe(true);
    checkboxes[0].click();
    await fixture.whenStable();
    expect(toggle).toHaveBeenCalledWith(tasks[0]);
    expect(tasks[0].completed).toBe(false);
    expect(checkboxes[0].checked).toBe(false);
  });

  it('emits keyboard and drag reorders with the stable task ID', async () => {
    const reorder = vi.fn();
    fixture.componentInstance.reorderRequested.subscribe(reorder);
    element
      .querySelector('button')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      );
    expect(reorder).toHaveBeenCalledWith({ previousIndex: 0, currentIndex: 1, taskId: 1 });
    fixture.debugElement
      .query(By.directive(CdkDropList))
      .triggerEventHandler('cdkDropListDropped', {
        previousIndex: 1,
        currentIndex: 0,
        item: { data: 2 },
      });
    await fixture.whenStable();
    expect(reorder).toHaveBeenCalledWith({ previousIndex: 1, currentIndex: 0, taskId: 2 });
  });

  it('disables completion and dragging for received tasks', async () => {
    fixture.componentRef.setInput('tasks', [{ ...tasks[0], canEdit: false }, tasks[1]]);
    await fixture.whenStable();
    const received = element.querySelector('li')!;
    expect(received.querySelector('button')!.disabled).toBe(true);
    expect(received.querySelector('input')!.disabled).toBe(true);
    expect(received.classList.contains('cdk-drag-disabled')).toBe(true);
    expect(received.textContent).toContain('Read-only');
  });

  it('reuses list rows when the parent supplies a reordered array', async () => {
    const rows = Array.from(element.querySelectorAll('li'));
    fixture.componentRef.setInput('tasks', [...tasks].reverse());
    await fixture.whenStable();
    const reordered = element.querySelectorAll('li');
    expect(reordered[0]).toBe(rows[1]);
    expect(reordered[1]).toBe(rows[0]);
  });

  it('distinguishes loading, empty and failed read states', async () => {
    fixture.componentRef.setInput('loading', true);
    await fixture.whenStable();
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Loading tasks');
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('tasks', []);
    await fixture.whenStable();
    expect(element.textContent).toContain('No tasks for this day.');
    fixture.componentRef.setInput('error', 'Unable to load tasks.');
    await fixture.whenStable();
    expect(element.textContent).not.toContain('No tasks for this day.');
  });
});
