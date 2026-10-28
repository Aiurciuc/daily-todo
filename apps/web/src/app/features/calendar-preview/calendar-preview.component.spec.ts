import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CalendarPreviewComponent } from './calendar-preview.component';
import { CalendarTimeGridComponent } from './calendar-time-grid/calendar-time-grid.component';
import { TaskDetailsComponent } from './task-details/task-details.component';
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
  sharedWith: 'recipient@example.com',
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

  it('overlays the calendar only while loading and restores interaction afterwards', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(CalendarPreviewComponent);
    const http = TestBed.inject(HttpTestingController);
    await TestBed.tick();
    const pending = http.expectOne((req) => req.url === '/api/tasks' && req.method === 'GET');
    const element = fixture.nativeElement as HTMLElement;
    const workspace = element.querySelector('.workspace')!;
    const content = element.querySelector('.calendar-content')!;
    const grid = element.querySelector('app-calendar-time-grid');
    expect(grid).not.toBeNull();
    expect(workspace.getAttribute('aria-busy')).toBe('true');
    expect(content.hasAttribute('inert')).toBe(true);
    expect(element.querySelector('.loading-overlay[role="status"]')?.getAttribute('aria-label'))
      .toBe('Loading tasks…');
    expect(element.querySelector('.loading-spinner')?.getAttribute('aria-hidden')).toBe('true');
    pending.flush([task]);
    await fixture.whenStable();
    expect(element.querySelector('.loading-overlay')).toBeNull();
    expect(workspace.getAttribute('aria-busy')).toBe('false');
    expect(content.hasAttribute('inert')).toBe(false);
    expect(element.querySelector('app-calendar-time-grid')).toBe(grid);
  });

  it('renders only server data, accurate minutes and real notes', async () => {
    const { fixture, element } = await render();
    expect(element.querySelector('app-calendar-toolbar')).toBeNull();
    expect(element.querySelectorAll('.calendar-task')).toHaveLength(1);
    expect(element.querySelector('.calendar-task')?.textContent).toContain('09:37');
    element.querySelector<HTMLButtonElement>('.calendar-task')!.click();
    await fixture.whenStable();
    expect(element.querySelector('.details .notes')?.textContent).toBe('Actual stored notes');
    expect(element.querySelector('.details .sharing-info')?.textContent).toContain(
      'Shared with recipient@example.com · Recipient has read-only access.',
    );
    expect(element.querySelector('app-task-details > p')).toBeNull();
    expect(element.textContent).not.toContain('No tasks for this period');
    expect(element.querySelector('app-calendar-time-grid')).not.toBeNull();
  });

  it('shows shared and private tasks together and narrows only by the active day', async () => {
    const { fixture, element } = await render([
      { ...task, title: 'Shared work', canEdit: false },
      { ...task, id: 43, title: 'Private work', visibility: 'PRIVATE', sharedWith: null },
      { ...task, id: 44, title: 'Another day', date: dateKey(calendarDayDate(0, 1)) },
    ]);
    expect(element.querySelectorAll('.calendar-task')).toHaveLength(3);
    fixture.componentInstance.activeDay.set(0);
    fixture.componentInstance.view.set('Day');
    await fixture.whenStable();
    const tasks = element.querySelectorAll('.calendar-task');
    expect(tasks).toHaveLength(2);
    expect(Array.from(tasks, (item) => item.textContent).join(' ')).toContain('Shared work');
    expect(Array.from(tasks, (item) => item.textContent).join(' ')).toContain('Private work');
    fixture.componentInstance.activeDay.set(1);
    await fixture.whenStable();
    expect(element.querySelectorAll('.calendar-task')).toHaveLength(1);
    expect(element.querySelector('.calendar-task')?.textContent).toContain('Another day');
  });

  it('displays received tasks read-only and guards parent mutation handlers', async () => {
    const { fixture, http, element, dialog } = await render([{ ...task, canEdit: false }]);
    element.querySelector<HTMLButtonElement>('.calendar-task')!.click();
    await fixture.whenStable();
    expect(element.querySelector('.details h3')?.textContent).toBe(task.title);
    expect(element.querySelector('.details .sharing-info')?.textContent).toContain(
      'Shared with you · Read-only',
    );
    expect(element.querySelector('[aria-label="Edit task"]')).toBeNull();
    expect(element.querySelector('[aria-label="Delete task"]')).toBeNull();
    expect(element.querySelector('.detail-actions .secondary')).toBeNull();
    const details = fixture.debugElement.query(By.directive(TaskDetailsComponent))
      .componentInstance as TaskDetailsComponent;
    details.editRequested.emit();
    details.completionToggled.emit();
    details.deleteRequested.emit();
    expect(element.querySelector('dialog')!.showModal).not.toHaveBeenCalled();
    http.expectNone((req) => req.method !== 'GET');
    // Even a stale edit dialog cannot update a now-read-only task.
    const parent = fixture.componentInstance as unknown as { editingId: { set(id: number): void } };
    parent.editingId.set(task.id);
    dialog.taskCreated.emit(task);
    http.expectNone((req) => req.method !== 'GET');
  });

  it('moves immediately and confirms without reloading or replacing the calendar', async () => {
    const { fixture, http, element } = await render([{ ...task, completed: true }]);
    const grid = fixture.debugElement.query(By.directive(CalendarTimeGridComponent))
      .componentInstance as CalendarTimeGridComponent;
    const moved = {
      ...task,
      completed: true,
      date: dateKey(calendarDayDate(0, 2)),
      startMinute: 615,
    };
    const scroll = element.querySelector<HTMLElement>('.calendar-scroll')!;
    scroll.scrollTop = 320;
    grid.taskMoved.emit({ id: task.id, day: 2, startMinute: 615 });
    const update = http.expectOne('/api/tasks/42');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({
      title: task.title,
      date: moved.date,
      startMinute: 615,
      durationMinutes: 60,
      visibility: task.visibility,
      notes: task.notes,
      sharedWith: task.sharedWith,
    });
    await fixture.whenStable();
    expect(grid.interactionDisabled()).toBe(true);
    expect(element.querySelectorAll('.day-column')[2].textContent).toContain(task.title);
    expect(element.querySelector('.calendar-task')?.textContent).toContain('10:15');
    expect(element.querySelector('.calendar-scroll')).toBe(scroll);
    expect(scroll.scrollTop).toBe(320);
    expect(element.textContent).not.toContain('Loading tasks');
    grid.taskMoved.emit({ id: task.id, day: 3, startMinute: 660 });
    http.expectNone('/api/tasks/42');
    update.flush(moved);
    await TestBed.tick();
    http.expectNone((request) => request.method === 'GET');
    await fixture.whenStable();
    expect(element.querySelector('.calendar-task.completed')).not.toBeNull();
    expect(element.textContent).toContain('10:15');
    expect(element.textContent).toContain('Task moved.');
    expect(element.querySelector('.calendar-scroll')).toBe(scroll);
    expect(scroll.scrollTop).toBe(320);
    expect(element.querySelector('.notice-error')).toBeNull();
  });

  it('keeps the original task after a failed drag save and permits retry', async () => {
    const { fixture, http, element } = await render();
    const grid = fixture.debugElement.query(By.directive(CalendarTimeGridComponent))
      .componentInstance as CalendarTimeGridComponent;
    grid.taskMoved.emit({ id: task.id, day: 1, startMinute: 600 });
    const update = http.expectOne('/api/tasks/42');
    await fixture.whenStable();
    expect(element.querySelectorAll('.day-column')[1].textContent).toContain(task.title);
    expect(element.querySelector('.calendar-task')?.textContent).toContain('10:00');
    update.flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(element.querySelector('.calendar-task')?.textContent).toContain('09:37');
    expect(element.querySelector('.notice-error[role="alert"]')?.textContent).toContain(
      'Could not move task.',
    );
    expect(element.querySelector('.notice-error')?.textContent).toContain(
      'Previous position restored.',
    );
    expect(element.querySelector('.workspace > [role="alert"]')).toBeNull();
    expect(element.textContent).not.toContain('Task moved.');
    http.expectNone((request) => request.method === 'GET');
    element.querySelector<HTMLButtonElement>('[aria-label="Dismiss message"]')!.click();
    await fixture.whenStable();
    expect(element.querySelector('.notice')).toBeNull();
    expect(grid.interactionDisabled()).toBe(false);
    grid.taskMoved.emit({ id: task.id, day: 1, startMinute: 600 });
    http.expectOne('/api/tasks/42').flush({}, { status: 503, statusText: 'Unavailable' });
  });

  it('shows API validation in the red banner and clears the error on a successful retry', async () => {
    const { fixture, http, element } = await render();
    const grid = fixture.debugElement.query(By.directive(CalendarTimeGridComponent))
      .componentInstance as CalendarTimeGridComponent;
    grid.taskMoved.emit({ id: task.id, day: 1, startMinute: 600 });
    http
      .expectOne('/api/tasks/42')
      .flush(
        { message: ['Recipient no longer exists'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    expect(element.querySelector('.notice-error')?.textContent).toContain(
      'Recipient no longer exists',
    );
    grid.taskMoved.emit({ id: task.id, day: 1, startMinute: 600 });
    http.expectOne('/api/tasks/42').flush({
      ...task,
      date: dateKey(calendarDayDate(0, 1)),
      startMinute: 600,
      notes: 'Canonical response',
    });
    await fixture.whenStable();
    expect(element.querySelector('.notice-error')).toBeNull();
    expect(element.querySelector('.notice[role="status"]')?.textContent).toContain('Task moved.');
    expect(element.querySelector('.details .notes')?.textContent).toContain('Canonical response');
    http.expectNone((request) => request.method === 'GET');
  });

  it('does not restore a moved task into a different week after navigation and a failed save', async () => {
    const { fixture, http, element } = await render();
    const grid = fixture.debugElement.query(By.directive(CalendarTimeGridComponent))
      .componentInstance as CalendarTimeGridComponent;
    grid.taskMoved.emit({ id: task.id, day: 1, startMinute: 600 });
    const update = http.expectOne('/api/tasks/42');
    element.querySelector<HTMLButtonElement>('.date-navigation [aria-label="Next week"]')!.click();
    await TestBed.tick();
    http.expectOne((request) => request.method === 'GET').flush([]);
    await fixture.whenStable();
    update.flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(element.querySelectorAll('.calendar-task')).toHaveLength(0);
    expect(element.querySelector('.notice-error')?.textContent).toContain('Could not move task.');
    http.expectNone((request) => request.method === 'GET');
  });

  it('reconciles a stale range response if navigation overlaps a successful move', async () => {
    const { fixture, http, element } = await render();
    const grid = fixture.debugElement.query(By.directive(CalendarTimeGridComponent))
      .componentInstance as CalendarTimeGridComponent;
    grid.taskMoved.emit({ id: task.id, day: 1, startMinute: 600 });
    const update = http.expectOne('/api/tasks/42');
    element.querySelector<HTMLButtonElement>('.date-navigation [aria-label="Next week"]')!.click();
    await TestBed.tick();
    http.expectOne((request) => request.method === 'GET').flush([]);
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('.date-navigation [aria-label="Previous week"]')!.click();
    await TestBed.tick();
    const returningRead = http.expectOne((request) => request.method === 'GET');
    update.flush({ ...task, date: dateKey(calendarDayDate(0, 1)), startMinute: 600 });
    await TestBed.tick();
    returningRead.flush([task]);
    await fixture.whenStable();
    expect(element.querySelectorAll('.day-column')[1].textContent).toContain(task.title);
    expect(element.querySelector('.calendar-task')?.textContent).toContain('10:00');
    http.expectNone((request) => request.method === 'GET');

    // A later fresh read supersedes the correction (including subsequent external edits).
    element.querySelector<HTMLButtonElement>('.date-navigation [aria-label="Next week"]')!.click();
    await TestBed.tick();
    http.expectOne((request) => request.method === 'GET').flush([]);
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('.date-navigation [aria-label="Previous week"]')!.click();
    await TestBed.tick();
    http.expectOne((request) => request.method === 'GET').flush([task]);
    await fixture.whenStable();
    expect(element.querySelector('.calendar-task')?.textContent).toContain('09:37');
  });

  it('rolls back only scheduling after a fresh read changes task metadata', async () => {
    const { fixture, http, element } = await render();
    const grid = fixture.debugElement.query(By.directive(CalendarTimeGridComponent))
      .componentInstance as CalendarTimeGridComponent;
    grid.taskMoved.emit({ id: task.id, day: 1, startMinute: 600 });
    const update = http.expectOne('/api/tasks/42');
    element.querySelector<HTMLButtonElement>('.date-navigation [aria-label="Next week"]')!.click();
    await TestBed.tick();
    http.expectOne((request) => request.method === 'GET').flush([]);
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('.date-navigation [aria-label="Previous week"]')!.click();
    await TestBed.tick();
    http
      .expectOne((request) => request.method === 'GET')
      .flush([{ ...task, title: 'Updated elsewhere', notes: 'Fresh notes', canEdit: false }]);
    await fixture.whenStable();
    update.flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(element.querySelector('.calendar-task')?.textContent).toContain('Updated elsewhere');
    expect(element.querySelector('.calendar-task')?.textContent).toContain('09:37');
    element.querySelector<HTMLElement>('.calendar-task')!.click();
    await fixture.whenStable();
    expect(element.querySelector('.details .notes')?.textContent).toContain('Fresh notes');
    expect(element.querySelector('button[aria-label="Edit task"]')).toBeNull();
    http.expectNone((request) => request.method === 'GET');
  });

  it('guards drag saves for read-only, missing, no-op and invalid targets', async () => {
    const { fixture, http } = await render([
      { ...task, canEdit: false },
      { ...task, id: 43 },
    ]);
    const grid = fixture.debugElement.query(By.directive(CalendarTimeGridComponent))
      .componentInstance as CalendarTimeGridComponent;
    for (const move of [
      { id: task.id, day: 1, startMinute: 600 },
      { id: 99, day: 1, startMinute: 600 },
      { id: 43, day: 0, startMinute: 577 },
      { id: 43, day: 7, startMinute: 600 },
      { id: 43, day: 1, startMinute: 1430 },
      { id: 43, day: 1, startMinute: -1 },
    ])
      grid.taskMoved.emit(move);
    http.expectNone((request) => request.method !== 'GET');
  });

  it('persists moving into and out of the untimed strip', async () => {
    const { fixture, http, element } = await render();
    const grid = fixture.debugElement.query(By.directive(CalendarTimeGridComponent))
      .componentInstance as CalendarTimeGridComponent;
    const untimed = { ...task, startMinute: null, durationMinutes: null };
    grid.taskMoved.emit({ id: task.id, day: 0, startMinute: null });
    const update = http.expectOne('/api/tasks/42');
    expect(update.request.body).toMatchObject({ startMinute: null, durationMinutes: null });
    await fixture.whenStable();
    expect(element.querySelector('.untimed-task')?.textContent).toContain(task.title);
    update.flush(untimed);
    await TestBed.tick();
    http.expectNone((request) => request.method === 'GET');
    await fixture.whenStable();
    grid.taskMoved.emit({ id: task.id, day: 1, startMinute: 600 });
    const schedule = http.expectOne('/api/tasks/42');
    expect(schedule.request.body).toMatchObject({ startMinute: 600, durationMinutes: 60 });
    await fixture.whenStable();
    expect(element.querySelector('.timed-drag')?.textContent).toContain(task.title);
    schedule.flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(element.querySelector('.untimed-task')?.textContent).toContain(task.title);
    expect(element.querySelector('.timed-drag')).toBeNull();
  });

  it('handles an empty database and creates using server-generated ids', async () => {
    const { fixture, http, element, dialog } = await render([]);
    expect(element.textContent).toContain('Select a task');
    expect(element.textContent).not.toContain('No tasks for this period');
    expect(element.querySelector('app-calendar-time-grid')).not.toBeNull();
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

  it.each([
    { message: 'Recipient email must belong to a registered user' },
    { message: ['Cannot share a task with yourself'] },
  ])(
    'shows actionable sharing validation errors without closing the draft: $message',
    async ({ message }) => {
      const { fixture, http, element, dialog } = await render([]);
      dialog.taskCreated.emit(task);
      http.expectOne('/api/tasks').flush({ message }, { status: 400, statusText: 'Bad Request' });
      await fixture.whenStable();
      expect(element.querySelector('dialog')!.close).not.toHaveBeenCalled();
      expect(element.querySelector('dialog [role="alert"]')?.textContent).toContain(
        Array.isArray(message) ? message.join(' ') : message,
      );
      expect(element.textContent).not.toContain('Check the API/database connection');
    },
  );

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
    expect(element.querySelector('.details .sharing-info')).toBeNull();
    expect(element.querySelector('.unscheduled-tasks')?.textContent).toContain('Updated title');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteButton = element.querySelector<HTMLButtonElement>(
      'app-task-details .details .detail-actions [aria-label="Delete task"]',
    )!;
    expect(deleteButton.classList.contains('terra-button')).toBe(true);
    expect(deleteButton.getAttribute('data-variant')).toBe('outlined');
    expect(deleteButton.querySelector('terra-icon')).not.toBeNull();
    deleteButton.click();
    const deletion = http.expectOne('/api/tasks/42');
    expect(deletion.request.method).toBe('DELETE');
    await fixture.whenStable();
    expect(deleteButton.disabled).toBe(true);
    deletion.flush(null);
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush([]);
    await fixture.whenStable();
    expect(element.querySelector('.details')).toBeNull();
  });

  it('keeps the task when deletion from the details card is canceled', async () => {
    const { fixture, http, element } = await render();
    element.querySelector<HTMLButtonElement>('.calendar-task')!.click();
    await fixture.whenStable();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    element
      .querySelector<HTMLButtonElement>('app-task-details [aria-label="Delete task"]')!
      .click();
    await fixture.whenStable();
    http.expectNone((req) => req.method === 'DELETE');
    expect(element.querySelector('.details h3')?.textContent).toBe(task.title);
  });

  it('loads new ranges rather than carrying events into other weeks, and retries failures', async () => {
    const { fixture, http, element } = await render();
    element.querySelector<HTMLButtonElement>('.date-navigation [aria-label="Next week"]')!.click();
    await TestBed.tick();
    const next = http.expectOne((req) => req.method === 'GET');
    expect(element.querySelector('.loading-overlay')).not.toBeNull();
    expect(next.request.params.get('from')).toBe(dateKey(calendarDayDate(1, 0)));
    next.flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(element.textContent).toContain('Unable to load tasks');
    expect(element.querySelector('.loading-overlay')).toBeNull();
    expect(element.querySelector('.calendar-content')?.hasAttribute('inert')).toBe(false);
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
    element.querySelectorAll<HTMLButtonElement>('.top-views button')[2].click();
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush([task]);
    await fixture.whenStable();
    expect(element.querySelector('.month-task')?.textContent).toBe(task.title);
    expect(element.querySelector('.month-task')?.parentElement?.textContent).toContain(
      String(calendarDayDate(0, 0).getDate()),
    );
  });
});
