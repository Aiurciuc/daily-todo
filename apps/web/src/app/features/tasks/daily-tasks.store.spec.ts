import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DailyTasksComponent } from './daily-tasks/daily-tasks.component';
import { DailyTasksStore } from './daily-tasks.store';

async function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), DailyTasksStore],
  });
  const store = TestBed.inject(DailyTasksStore);
  const http = TestBed.inject(HttpTestingController);
  await TestBed.tick();
  const tasks = [1, 2, 3].map((id) => ({
    id,
    title: `Task ${id}`,
    date: store.day(),
    completed: false,
  }));
  http.expectOne((request) => request.method === 'GET').flush(tasks);
  await TestBed.tick();
  return { store, http, tasks };
}

describe('DailyTasksStore', () => {
  it('immediately reorders, restores the successful base on failure and shows toasts', async () => {
    const { store, http, tasks } = await setup();
    store.reorder({ previousIndex: 0, currentIndex: 1 });
    expect(store.tasks().map((task) => task.id)).toEqual([2, 1, 3]);
    expect(store.loading()).toBe(false);
    const saved = [tasks[1], tasks[0], tasks[2]];
    http.expectOne('/api/tasks/order').flush(saved);
    expect(store.toasts()[0].kind).toBe('success');
    store.reorder({ previousIndex: 0, currentIndex: 2 });
    http.expectOne('/api/tasks/order').flush({}, { status: 500, statusText: 'Error' });
    expect(store.tasks()).toEqual(saved);
    expect(store.toasts()[1].kind).toBe('error');
    store.dismissToast(store.toasts()[0].id);
    expect(store.toasts()).toHaveLength(1);
    http.verify();
  });

  it('uses the dragged task ID if an earlier rollback changes its index during the drag', async () => {
    const { store, http, tasks } = await setup();
    store.reorder({ previousIndex: 0, currentIndex: 1 });
    // Task 2 starts dragging at index 0, then the earlier save rolls back.
    http.expectOne('/api/tasks/order').flush({}, { status: 500, statusText: 'Error' });
    store.reorder({ previousIndex: 0, currentIndex: 2, taskId: 2 });
    const request = http.expectOne('/api/tasks/order');
    expect(request.request.body.ids).toEqual([1, 3, 2]);
    request.flush([tasks[0], tasks[2], tasks[1]]);
    http.verify();
  });

  it('defers a requested reconciliation until accepted writes settle', async () => {
    const { store, http, tasks } = await setup();
    store.reorder({ previousIndex: 0, currentIndex: 1 });
    const first = http.expectOne('/api/tasks/order');
    store.reorder({ previousIndex: 1, currentIndex: 2 });
    store.retry();
    http.expectNone((request) => request.method === 'GET');
    first.flush({}, { status: 409, statusText: 'Conflict' });
    http.expectOne('/api/tasks/order').flush({}, { status: 409, statusText: 'Conflict' });
    await TestBed.tick();
    const fresh = [...tasks, { ...tasks[0], id: 4, title: 'Added elsewhere' }];
    http.expectOne((request) => request.method === 'GET').flush(fresh);
    await TestBed.tick();
    expect(store.tasks()).toEqual(fresh);
    http.verify();
  });

  it('queues rapid reorders and never rolls an earlier failure over a newer intent', async () => {
    const { store, http, tasks } = await setup();
    store.reorder({ previousIndex: 0, currentIndex: 1 });
    const first = http.expectOne('/api/tasks/order');
    store.reorder({ previousIndex: 1, currentIndex: 2 });
    expect(store.tasks().map((task) => task.id)).toEqual([2, 3, 1]);
    http.expectNone('/api/tasks/order');
    first.flush({}, { status: 500, statusText: 'Error' });
    expect(store.tasks().map((task) => task.id)).toEqual([2, 3, 1]);
    const second = http.expectOne('/api/tasks/order');
    expect(second.request.body.ids).toEqual([2, 3, 1]);
    second.flush([tasks[1], tasks[2], tasks[0]]);
    expect(store.tasks().map((task) => task.id)).toEqual([2, 3, 1]);
    http.verify();
  });

  it('restores the original base if every queued reorder fails', async () => {
    const { store, http, tasks } = await setup();
    store.reorder({ previousIndex: 0, currentIndex: 1 });
    const first = http.expectOne('/api/tasks/order');
    store.reorder({ previousIndex: 1, currentIndex: 2 });
    first.flush({}, { status: 500, statusText: 'Error' });
    http.expectOne('/api/tasks/order').flush({}, { status: 500, statusText: 'Error' });
    expect(store.tasks()).toEqual(tasks);
    http.verify();
  });

  it('queues completion toggles and adds without losing accepted writes', async () => {
    const { store, http, tasks } = await setup();
    store.setCompleted(tasks[0]);
    const first = http.expectOne('/api/tasks/1');
    store.setCompleted(tasks[0]);
    store.taskForm.title().value.set('New task');
    await store.add();
    expect(store.canAdd()).toBe(true);
    expect(store.taskForm.title().disabled()).toBe(false);
    first.flush({ ...tasks[0], completed: true });
    expect(store.tasks()[0].completed).toBe(false);
    const second = http.expectOne('/api/tasks/1');
    expect(second.request.body.completed).toBe(false);
    second.flush({ ...tasks[0], completed: false });
    http
      .expectOne((request) => request.method === 'POST')
      .flush({ ...tasks[0], id: 4, title: 'New task' });
    expect(store.tasks()).toHaveLength(4);
    expect(store.toasts().map((toast) => toast.kind)).toEqual(['success', 'success', 'success']);
    http.verify();
  });

  it('captures each day and labels old-day results without changing the current day', async () => {
    const { store, http, tasks } = await setup();
    const originalDay = store.day();
    store.reorder({ previousIndex: 0, currentIndex: 1 });
    const pending = http.expectOne('/api/tasks/order');
    store.move(1);
    await TestBed.tick();
    const otherTask = { ...tasks[0], id: 9, date: store.day() };
    http.expectOne((request) => request.method === 'GET').flush([otherTask]);
    await TestBed.tick();
    store.setCompleted(otherTask);
    pending.flush({}, { status: 500, statusText: 'Error' });
    expect(store.tasks()).toEqual([{ ...otherTask, completed: true }]);
    expect(store.toasts()[0].message).toContain(originalDay);
    http.expectOne('/api/tasks/9').flush({ ...otherTask, completed: true });
    expect(store.tasks()).toEqual([{ ...otherTask, completed: true }]);
    http.verify();
  });

  it('protects a pending day journal from a stale read after navigating back', async () => {
    const { store, http, tasks } = await setup();
    store.reorder({ previousIndex: 0, currentIndex: 1 });
    const pending = http.expectOne('/api/tasks/order');
    store.move(1);
    await TestBed.tick();
    http.expectOne((request) => request.method === 'GET').flush([]);
    await TestBed.tick();
    store.move(-1);
    await TestBed.tick();
    const stale = http.expectOne((request) => request.method === 'GET');
    pending.flush([tasks[1], tasks[0], tasks[2]]);
    stale.flush(tasks);
    await TestBed.tick();
    expect(store.tasks().map((task) => task.id)).toEqual([2, 1, 3]);
    http.verify();
  });

  it('keeps a pending journal writable after a failed navigation read', async () => {
    const { store, http, tasks } = await setup();
    store.setCompleted(tasks[0]);
    const pending = http.expectOne('/api/tasks/1');
    store.move(1);
    await TestBed.tick();
    http.expectOne((request) => request.method === 'GET').flush([]);
    await TestBed.tick();
    store.move(-1);
    await TestBed.tick();
    http
      .expectOne((request) => request.method === 'GET')
      .flush({}, { status: 500, statusText: 'Error' });
    await TestBed.tick();
    expect(store.canAdd()).toBe(true);
    store.setCompleted(tasks[0]);
    pending.flush({ ...tasks[0], completed: true });
    const second = http.expectOne('/api/tasks/1');
    expect(second.request.body.completed).toBe(false);
    second.flush(tasks[0]);
    http.verify();
  });

  it('never resets another day draft when an add finishes', async () => {
    const { store, http, tasks } = await setup();
    const day = store.day();
    store.taskForm.title().value.set('Old day task');
    await store.add();
    const pending = http.expectOne((request) => request.method === 'POST');
    store.move(1);
    await TestBed.tick();
    http.expectOne((request) => request.method === 'GET').flush([]);
    await TestBed.tick();
    store.taskForm.title().value.set('New day draft');
    pending.flush({ ...tasks[0], id: 4, title: 'Old day task' });
    expect(store.tasks()).toEqual([]);
    expect(store.taskForm.title().value()).toBe('New day draft');
    expect(store.toasts()[0].message).toContain(day);
    http.verify();
  });

  it('ignores invalid reorder indices', async () => {
    const { store, http, tasks } = await setup();
    for (const currentIndex of [-1, 3, 0.5, Number.NaN]) {
      store.reorder({ previousIndex: 0, currentIndex });
    }
    expect(store.tasks()).toEqual(tasks);
    http.expectNone((request) => request.method === 'PATCH');
    http.verify();
  });

  it('cancels a pending write and queued writes when the container is destroyed', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DailyTasksComponent);
    const store = fixture.componentInstance.store;
    const http = TestBed.inject(HttpTestingController);
    await TestBed.tick();
    const task = { id: 1, title: 'Task', date: store.day(), completed: false };
    http.expectOne((request) => request.method === 'GET').flush([task]);
    await TestBed.tick();
    store.setCompleted(task);
    const request = http.expectOne('/api/tasks/1');
    store.setCompleted(task);
    fixture.destroy();
    expect(request.cancelled).toBe(true);
    http.expectNone('/api/tasks/1');
    http.verify();
  });

  it('provides independent store instances and cancels reads on destruction', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const first = TestBed.createComponent(DailyTasksComponent);
    const second = TestBed.createComponent(DailyTasksComponent);
    expect(first.componentInstance.store).not.toBe(second.componentInstance.store);
    await TestBed.tick();
    const requests = http.match((request) => request.method === 'GET');
    expect(requests).toHaveLength(2);
    first.destroy();
    second.destroy();
    expect(requests.every((request) => request.cancelled)).toBe(true);
    http.verify();
  });
});
