import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CalendarPreviewComponent } from './calendar-preview.component';
import { TaskDialogComponent } from './task-dialog/task-dialog.component';
import { calendarDayDate, dateKey } from './calendar-preview.utils';
import { PersistedCalendarTask } from './calendar-preview.models';

const task: PersistedCalendarTask = {
  id: 42,
  title: 'Saved planning',
  date: dateKey(calendarDayDate(0, 0)),
  startMinute: 577,
  durationMinutes: 60,
  visibility: 'SHARED',
  completed: false,
  notes: 'Actual stored notes',
  sharedWith: 'Design',
};

describe('API-backed calendar', () => {
  async function render(items: PersistedCalendarTask[] = [task]) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(CalendarPreviewComponent);
    const http = TestBed.inject(HttpTestingController);
    await TestBed.tick();
    const initial = http.expectOne((req) => req.url === '/api/tasks' && req.method === 'GET');
    expect(initial.request.params.get('from')).toBe(dateKey(calendarDayDate(0, 0)));
    expect(initial.request.params.get('to')).toBe(dateKey(calendarDayDate(0, 7)));
    initial.flush(items);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const dialog = fixture.debugElement.query(By.directive(TaskDialogComponent))
      .componentInstance as TaskDialogComponent;
    const modal = element.querySelector('dialog')!;
    modal.showModal = vi.fn();
    modal.close = vi.fn();
    return { fixture, http, element, dialog };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('renders only server data, accurate minutes and real notes, and filters', async () => {
    const { fixture, element } = await render();
    expect(element.querySelectorAll('.calendar-task')).toHaveLength(1);
    expect(element.querySelector('.calendar-task')?.textContent).toContain('09:37');
    element.querySelector<HTMLButtonElement>('.calendar-task')!.click();
    await fixture.whenStable();
    expect(element.querySelector('.details .notes')?.textContent).toBe('Actual stored notes');
    element.querySelectorAll<HTMLButtonElement>('.filters button')[2].click();
    await fixture.whenStable();
    expect(element.querySelectorAll('.calendar-task')).toHaveLength(0);
    expect(element.textContent).toContain('No tasks for this period');
  });

  it('handles an empty database and creates using server-generated ids', async () => {
    const { fixture, http, element, dialog } = await render([]);
    expect(element.textContent).toContain('Select a task');
    const draft = {
      title: task.title,
      date: task.date,
      startMinute: task.startMinute,
      durationMinutes: task.durationMinutes,
      visibility: task.visibility,
      notes: task.notes,
      sharedWith: task.sharedWith,
    };
    dialog.taskCreated.emit(draft);
    const post = http.expectOne('/api/tasks');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(draft);
    expect(element.querySelectorAll('.calendar-task')).toHaveLength(0);
    post.flush(task);
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush([task]);
    await fixture.whenStable();
    expect(element.querySelector('.details h3')?.textContent).toBe(task.title);
    expect(element.querySelectorAll('.calendar-task')).toHaveLength(1);
  });

  it('persists completion and does not pretend failed changes succeeded', async () => {
    const { fixture, http, element } = await render();
    element.querySelector<HTMLButtonElement>('.calendar-task')!.click();
    await fixture.whenStable();
    const button = () => element.querySelector<HTMLButtonElement>('.detail-actions .secondary')!;
    button().click();
    const patch = http.expectOne('/api/tasks/42');
    expect(patch.request.body).toEqual({ completed: true });
    patch.flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(element.querySelector('.calendar-task.completed')).toBeNull();
    expect(element.textContent).toContain('Could not save changes');
    button().click();
    http.expectOne('/api/tasks/42').flush({ ...task, completed: true });
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush([{ ...task, completed: true }]);
    await fixture.whenStable();
    expect(element.querySelector('.calendar-task.completed')).not.toBeNull();
  });

  it('persists edits and deletion', async () => {
    const { fixture, http, element, dialog } = await render();
    element.querySelector<HTMLButtonElement>('.calendar-task')!.click();
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('[aria-label="Edit task"]')!.click();
    await fixture.whenStable();
    const draft = {
      title: 'Updated title',
      date: task.date,
      startMinute: null,
      durationMinutes: null,
      visibility: 'PRIVATE' as const,
      notes: null,
      sharedWith: null,
    };
    dialog.taskCreated.emit(draft);
    const put = http.expectOne('/api/tasks/42');
    expect(put.request.method).toBe('PUT');
    put.flush({ ...task, ...draft });
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush([{ ...task, ...draft }]);
    await fixture.whenStable();
    expect(element.querySelector('.details h3')?.textContent).toBe('Updated title');
    expect(element.querySelector('.unscheduled-tasks')?.textContent).toContain('Updated title');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    Array.from(element.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Delete task')!
      .click();
    const deletion = http.expectOne('/api/tasks/42');
    expect(deletion.request.method).toBe('DELETE');
    deletion.flush(null);
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush([]);
    await fixture.whenStable();
    expect(element.querySelector('.details')).toBeNull();
  });

  it('loads new ranges rather than carrying events into other weeks, and retries failures', async () => {
    const { fixture, http, element } = await render();
    element.querySelector<HTMLButtonElement>('.navigation [aria-label="Next week"]')!.click();
    await TestBed.tick();
    const next = http.expectOne((req) => req.method === 'GET');
    expect(next.request.params.get('from')).toBe(dateKey(calendarDayDate(1, 0)));
    next.flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(element.textContent).toContain('Unable to load tasks');
    Array.from(element.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Retry')!
      .click();
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush([]);
    await fixture.whenStable();
    expect(element.querySelectorAll('.calendar-task')).toHaveLength(0);
  });

  it('loads a complete month and maps tasks to their actual dates', async () => {
    const { fixture, http, element } = await render();
    element.querySelectorAll<HTMLButtonElement>('.tools .view-switcher button')[2].click();
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush([task]);
    await fixture.whenStable();
    expect(element.querySelector('.month-task')?.textContent).toBe(task.title);
    expect(element.querySelector('.month-task')?.parentElement?.textContent).toContain(
      String(calendarDayDate(0, 0).getDate()),
    );
  });
});
