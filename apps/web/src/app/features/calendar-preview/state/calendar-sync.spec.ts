import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CalendarStore } from './calendar.store';
import { PersistedCalendarTask } from '../calendar-preview.models';

const range = { from: '2026-10-19', to: '2026-10-26' };
const task: PersistedCalendarTask = {
  id: 1,
  title: 'Shared meeting',
  date: range.from,
  startMinute: 540,
  durationMinutes: 60,
  visibility: 'SHARED',
  notes: '',
  sharedWith: 'reader@example.com',
  completed: false,
  canEdit: false,
};

describe('CalendarStore background sync', () => {
  let scope: EnvironmentInjector;
  let store: InstanceType<typeof CalendarStore>;
  let http: HttpTestingController;
  let visibility: 'visible' | 'hidden';

  beforeEach(() => {
    // Only fake interval scheduling; Angular's asynchronous rendering remains real.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DOCUMENT, useValue: document },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    scope = createEnvironmentInjector([CalendarStore], TestBed.inject(EnvironmentInjector));
    store = scope.get(CalendarStore);
  });
  afterEach(() => {
    if (!scope.destroyed) scope.destroy();
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function load(items = [task]) {
    store.setRange(range);
    await TestBed.tick();
    http.expectOne((req) => req.method === 'GET').flush(items);
    await TestBed.tick();
    await TestBed.tick();
  }

  it('quietly reconciles additions, updates, deletions and revocations every 10 seconds', async () => {
    await load();
    vi.advanceTimersByTime(9_999);
    http.expectNone((req) => req.method === 'GET');
    vi.advanceTimersByTime(1);
    const poll = http.expectOne((req) => req.method === 'GET');
    expect(poll.request.params.get('from')).toBe(range.from);
    expect(poll.request.params.get('to')).toBe(range.to);
    expect(store.loading()).toBe(false);
    expect(store.tasks()).toEqual([task]);
    poll.flush([
      { ...task, title: 'Changed by owner', completed: true },
      { ...task, id: 2 },
    ]);
    await TestBed.tick();
    expect(store.tasks().map((item) => item.id)).toEqual([1, 2]);
    expect(store.tasks()[0]).toMatchObject({
      title: 'Changed by owner',
      completed: true,
      canEdit: false,
    });
    expect(store.notice()).toBeNull();
    expect(store.loadError()).toBe('');
    vi.advanceTimersByTime(10_000);
    http.expectOne((req) => req.method === 'GET').flush([]);
    await TestBed.tick();
    expect(store.tasks()).toEqual([]);
    expect(store.loading()).toBe(false);
  });

  it('does not invalidate layout identities when a poll has no changes', async () => {
    await load();
    const before = store.tasks();
    vi.advanceTimersByTime(10_000);
    http.expectOne((req) => req.method === 'GET').flush([{ ...task }]);
    await TestBed.tick();
    expect(store.tasks()).toBe(before);
    vi.advanceTimersByTime(10_000);
    http.expectOne((req) => req.method === 'GET').flush([{ ...task, notes: 'Updated notes' }]);
    await TestBed.tick();
    expect(store.tasks()).not.toBe(before);
    expect(store.tasks()[0].notes).toBe('Updated notes');
  });

  it('does not poll before the initial range has loaded or overlap slow requests', async () => {
    await TestBed.tick();
    vi.advanceTimersByTime(20_000);
    http.expectNone((req) => req.method === 'GET');
    store.setRange(range);
    await TestBed.tick();
    const initial = http.expectOne((req) => req.method === 'GET');
    vi.advanceTimersByTime(20_000);
    http.expectNone((req) => req.method === 'GET');
    initial.flush([task]);
    await TestBed.tick();
    await TestBed.tick();
    vi.advanceTimersByTime(10_000);
    const poll = http.expectOne((req) => req.method === 'GET');
    vi.advanceTimersByTime(30_000);
    window.dispatchEvent(new Event('focus'));
    http.expectNone((req) => req.method === 'GET');
    poll.flush([task]);
  });

  it('retains cached tasks after a background failure and retries on the next tick', async () => {
    await load();
    vi.advanceTimersByTime(10_000);
    http
      .expectOne((req) => req.method === 'GET')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await TestBed.tick();
    expect(store.tasks()).toEqual([task]);
    expect(store.loading()).toBe(false);
    expect(store.loadError()).toBe('');
    expect(store.mutationError()).toBe('');
    vi.advanceTimersByTime(10_000);
    http.expectOne((req) => req.method === 'GET').flush([]);
    await TestBed.tick();
    expect(store.tasks()).toEqual([]);
  });

  it('pauses in hidden tabs, cancels hidden reads, and refreshes on visibility or focus', async () => {
    await load();
    vi.advanceTimersByTime(10_000);
    const pending = http.expectOne((req) => req.method === 'GET');
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pending.cancelled).toBe(true);
    vi.advanceTimersByTime(30_000);
    window.dispatchEvent(new Event('focus'));
    http.expectNone((req) => req.method === 'GET');
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    http.expectOne((req) => req.method === 'GET').flush([task]);
    await TestBed.tick();
    window.dispatchEvent(new Event('focus'));
    http.expectOne((req) => req.method === 'GET').flush([]);
    await TestBed.tick();
    expect(store.tasks()).toEqual([]);
  });

  it('cancels old range polling on navigation and polls only the new range', async () => {
    await load();
    vi.advanceTimersByTime(10_000);
    const old = http.expectOne((req) => req.method === 'GET');
    store.setRange({ from: '2026-10-26', to: '2026-11-02' });
    await TestBed.tick();
    expect(old.cancelled).toBe(true);
    const next = http.expectOne((req) => req.method === 'GET');
    expect(next.request.params.get('from')).toBe('2026-10-26');
    next.flush([]);
    await TestBed.tick();
    await TestBed.tick();
    vi.advanceTimersByTime(10_000);
    const poll = http.expectOne((req) => req.method === 'GET');
    expect(poll.request.params.get('from')).toBe('2026-10-26');
    poll.flush([]);
  });

  it('never overwrites a completed optimistic move with an older poll, even before cleanup runs', async () => {
    await load([{ ...task, canEdit: true }]);
    vi.advanceTimersByTime(10_000);
    const old = http.expectOne((req) => req.method === 'GET');
    expect(store.moveTask(1, range.from, 600)).toBe(true);
    http.expectOne('/api/tasks/1').flush({ ...task, canEdit: true, startMinute: 600 });
    // No rendering/effect flush between write completion and this stale response.
    old.flush([task]);
    await TestBed.tick();
    expect(store.tasks()[0].startMinute).toBe(600);
    expect(store.notice()?.message).toBe('Task moved.');
    http.expectNone((req) => req.method === 'GET');
    vi.advanceTimersByTime(10_000);
    http.expectOne((req) => req.method === 'GET').flush([{ ...task, startMinute: 630 }]);
    await TestBed.tick();
    expect(store.tasks()[0].startMinute).toBe(630);
  });

  it('does not let a stale poll overwrite a rolled-back move before cleanup runs', async () => {
    await load([{ ...task, canEdit: true }]);
    vi.advanceTimersByTime(10_000);
    const old = http.expectOne((req) => req.method === 'GET');
    store.moveTask(1, range.from, 600);
    http.expectOne('/api/tasks/1').flush({}, { status: 503, statusText: 'Unavailable' });
    old.flush([{ ...task, startMinute: 900 }]);
    await TestBed.tick();
    expect(store.tasks()[0].startMinute).toBe(540);
    expect(store.notice()?.kind).toBe('error');
  });

  it('cancels pending sync and skips polling during writes', async () => {
    await load([{ ...task, canEdit: true }]);
    vi.advanceTimersByTime(10_000);
    const old = http.expectOne((req) => req.method === 'GET');
    store.moveTask(1, range.from, 600);
    const update = http.expectOne('/api/tasks/1');
    await TestBed.tick();
    expect(old.cancelled).toBe(true);
    vi.advanceTimersByTime(30_000);
    window.dispatchEvent(new Event('focus'));
    http.expectNone((req) => req.method === 'GET');
    update.flush({}, { status: 503, statusText: 'Unavailable' });
    await TestBed.tick();
    expect(store.tasks()[0].startMinute).toBe(540);
    vi.advanceTimersByTime(10_000);
    http.expectOne((req) => req.method === 'GET').flush([task]);
  });

  it('stops requests, timers and event listeners on destruction/account change', async () => {
    await load();
    vi.advanceTimersByTime(10_000);
    const pending = http.expectOne((req) => req.method === 'GET');
    scope.destroy();
    expect(pending.cancelled).toBe(true);
    vi.advanceTimersByTime(30_000);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    http.expectNone((req) => req.method === 'GET');
    scope = createEnvironmentInjector([CalendarStore], TestBed.inject(EnvironmentInjector));
    store = scope.get(CalendarStore);
    await TestBed.tick();
    expect(store.tasks()).toEqual([]);
    vi.advanceTimersByTime(10_000);
    http.expectNone((req) => req.method === 'GET');
  });
});
