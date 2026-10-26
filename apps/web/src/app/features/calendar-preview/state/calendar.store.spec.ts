import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CalendarStore } from './calendar.store';
import { CalendarRange, NewCalendarTask, PersistedCalendarTask } from '../calendar-preview.models';

const range = { from: '2026-10-19', to: '2026-10-26' };
const elsewhere = { from: '2026-10-26', to: '2026-11-02' };
const draft: NewCalendarTask = {
  title: 'Planning',
  date: range.from,
  startMinute: 577,
  durationMinutes: 60,
  visibility: 'SHARED',
  notes: 'Keep these notes',
  sharedWith: 'reader@example.com',
};
const task: PersistedCalendarTask = { ...draft, id: 42, completed: true };

describe('CalendarStore', () => {
  let http: HttpTestingController;
  let scope: EnvironmentInjector;
  let store: InstanceType<typeof CalendarStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    scope = createEnvironmentInjector([CalendarStore], TestBed.inject(EnvironmentInjector));
    store = scope.get(CalendarStore);
  });
  afterEach(() => {
    if (!scope.destroyed) scope.destroy();
    http.verify();
  });

  async function load(items: PersistedCalendarTask[] = [task], query: CalendarRange = range) {
    store.setRange(query);
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush(items);
    await TestBed.tick();
  }

  it('waits for a range, exposes read-only data and retries load errors', async () => {
    await TestBed.tick();
    http.expectNone('/api/tasks');
    store.setRange(range);
    await TestBed.tick();
    expect(store.loading()).toBe(true);
    const request = http.expectOne((req) => req.method === 'GET');
    expect(request.request.params.get('from')).toBe(range.from);
    expect(request.request.params.get('to')).toBe(range.to);
    request.flush({}, { status: 503, statusText: 'Unavailable' });
    await TestBed.tick();
    expect(store.loadError()).toContain('Unable to load tasks');
    expect(store.tasks()).toEqual([]);
    store.reload();
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush([task]);
    await TestBed.tick();
    expect(store.tasks()).toEqual([task]);
    expect(store.loadError()).toBe('');
    expect('set' in store.tasks).toBe(false);
  });

  it('confirms optimistic moves in place and serializes all write commands', async () => {
    await load();
    const moved = { ...task, date: '2026-10-20', startMinute: 615 };
    expect(store.moveTask(task.id, moved.date, moved.startMinute)).toBe(true);
    expect(store.tasks()).toEqual([moved]);
    expect(store.saving()).toBe(true);
    const update = http.expectOne('/api/tasks/42');
    expect(update.request.body).toEqual({ ...draft, date: moved.date, startMinute: 615 });
    store.createTask(draft);
    store.updateTask(task.id, draft);
    store.toggleCompleted(task.id);
    store.deleteTask(task.id);
    expect(store.moveTask(task.id, range.from, null)).toBe(false);
    http.expectNone((req) => req.method !== 'GET');
    update.flush({ ...moved, notes: 'Canonical notes' });
    await TestBed.tick();
    expect(store.tasks()[0].notes).toBe('Canonical notes');
    expect(store.tasks()[0].completed).toBe(true);
    expect(store.saving()).toBe(false);
    expect(store.notice()).toEqual({ kind: 'success', message: 'Task moved.' });
    http.expectNone((req) => req.method === 'GET');
  });

  it('rolls back only scheduling, retains fresh metadata and allows retry', async () => {
    await load();
    store.moveTask(task.id, '2026-10-20', null);
    const update = http.expectOne('/api/tasks/42');
    await load([], elsewhere);
    const fresh = { ...task, title: 'Updated elsewhere', notes: 'Fresh notes', canEdit: false };
    await load([fresh]);
    update.flush(
      { message: 'Recipient is unavailable' },
      { status: 400, statusText: 'Bad Request' },
    );
    await TestBed.tick();
    expect(store.tasks()).toEqual([fresh]);
    expect(store.notice()?.kind).toBe('error');
    expect(store.notice()?.message).toContain('Recipient is unavailable');
    expect(store.mutationError()).toBe('');
    expect(store.saving()).toBe(false);
    store.dismissNotice();
    expect(store.notice()).toBeNull();
    expect(store.moveTask(task.id, '2026-10-20', null)).toBe(false);
    http.expectNone((req) => req.method === 'GET');
  });

  it('keeps the accepted schedule when an already-pending range GET returns stale data', async () => {
    await load();
    store.moveTask(task.id, '2026-10-20', 600);
    const update = http.expectOne('/api/tasks/42');
    await load([], elsewhere);
    store.setRange(range);
    await TestBed.tick();
    const staleRead = http.expectOne((req) => req.method === 'GET');
    update.flush({ ...task, date: '2026-10-20', startMinute: 600 });
    await TestBed.tick();
    expect(staleRead.cancelled).toBe(false);
    staleRead.flush([task]);
    await TestBed.tick();
    expect(store.tasks()[0]).toMatchObject({ date: '2026-10-20', startMinute: 600 });
    store.reload();
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush([task]);
    await TestBed.tick();
    expect(store.tasks()).toEqual([task]);
  });

  it('does not insert a move result into an unrelated range', async () => {
    await load();
    store.moveTask(task.id, '2026-10-20', 600);
    const update = http.expectOne('/api/tasks/42');
    await load([], elsewhere);
    update.flush({ ...task, date: '2026-10-20', startMinute: 600 });
    await TestBed.tick();
    expect(store.tasks()).toEqual([]);
    http.expectNone((req) => req.method === 'GET');
  });

  it('guards received, missing, invalid and no-op move/update requests', async () => {
    await load([
      { ...task, canEdit: false },
      { ...task, id: 43 },
    ]);
    store.updateTask(task.id, draft);
    store.toggleCompleted(task.id);
    store.deleteTask(task.id);
    for (const [id, date, start] of [
      [42, '2026-10-20', 600],
      [99, range.from, 600],
      [43, range.from, 577],
      [43, range.from, -1],
      [43, range.from, 1430],
      [43, '2026-02-30', 600],
    ] as const)
      expect(store.moveTask(id, date, start)).toBe(false);
    http.expectNone((req) => req.method !== 'GET');
    store.setRange(elsewhere);
    await TestBed.tick();
    expect(store.moveTask(43, range.from, null)).toBe(false);
    http.expectOne((req) => req.method === 'GET').flush([]);
  });

  it('keeps failed CRUD drafts, exposes actionable errors and reloads only after success', async () => {
    await load([]);
    const saved = vi.fn();
    store.createTask(draft, saved);
    http
      .expectOne('/api/tasks')
      .flush({ message: ['Unknown recipient'] }, { status: 400, statusText: 'Bad Request' });
    await TestBed.tick();
    expect(saved).not.toHaveBeenCalled();
    expect(store.mutationError()).toBe('Unknown recipient');
    expect(store.notice()).toBeNull();
    http.expectNone((req) => req.method === 'GET');
    store.createTask(draft, saved);
    expect(store.mutationError()).toBe('');
    http.expectOne('/api/tasks').flush(task);
    await TestBed.tick();
    expect(saved).toHaveBeenCalledExactlyOnceWith(task);
    http.expectOne((req) => req.method === 'GET').flush([task]);
    await TestBed.tick();
    expect(store.notice()?.message).toBe('Task created.');
  });

  it.each(['create', 'update', 'complete', 'delete', 'move'] as const)(
    'cancels a pending %s on destruction without callbacks or leaking state to the next account',
    async (kind) => {
      await load();
      const callback = vi.fn();
      if (kind === 'create') store.createTask(draft, callback);
      if (kind === 'update') store.updateTask(task.id, draft, callback);
      if (kind === 'complete') store.toggleCompleted(task.id);
      if (kind === 'delete') store.deleteTask(task.id, callback);
      if (kind === 'move') store.moveTask(task.id, '2026-10-20', 600);
      const pending = http.expectOne((req) => req.method !== 'GET');
      scope.destroy();
      expect(pending.cancelled).toBe(true);
      expect(callback).not.toHaveBeenCalled();
      scope = createEnvironmentInjector([CalendarStore], TestBed.inject(EnvironmentInjector));
      store = scope.get(CalendarStore);
      expect(store.tasks()).toEqual([]);
      expect(store.saving()).toBe(false);
      expect(store.notice()).toBeNull();
      await load([]);
      http.expectNone((req) => req.method !== 'GET');
    },
  );

  it('cancels pending reads when the feature injector is destroyed', async () => {
    store.setRange(range);
    await TestBed.tick();
    const pending = http.expectOne((req) => req.method === 'GET');
    scope.destroy();
    expect(pending.cancelled).toBe(true);
  });
});
