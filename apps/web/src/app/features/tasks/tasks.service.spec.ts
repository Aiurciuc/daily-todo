import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TasksService } from './tasks.service';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { service: TestBed.inject(TasksService), http: TestBed.inject(HttpTestingController) };
}

describe('TasksService', () => {
  it('loads the selected day and cancels a stale read when the day changes', async () => {
    const { service, http } = setup();
    const day = signal('2024-02-29');
    const tasks = TestBed.runInInjectionContext(() => service.list(day));
    await TestBed.tick();
    const old = http.expectOne('/api/tasks?date=2024-02-29');
    day.set('2024-03-01');
    await TestBed.tick();
    expect(old.cancelled).toBe(true);
    const current = http.expectOne('/api/tasks?date=2024-03-01');
    expect(current.request.method).toBe('GET');
    current.flush([]);
    expect(tasks.value()).toEqual([]);
    http.verify();
  });

  it('writes an explicit completion value and sends the task date when adding', () => {
    const { service, http } = setup();
    service.add('Task', '2024-02-29').subscribe();
    const add = http.expectOne('/api/tasks');
    expect(add.request.method).toBe('POST');
    expect(add.request.body).toEqual({ title: 'Task', date: '2024-02-29' });
    add.flush({ id: 5, title: 'Task', date: '2024-02-29', completed: false });
    service.setCompleted(5, false).subscribe();
    const patch = http.expectOne('/api/tasks/5');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ completed: false });
    patch.flush({ id: 5, title: 'Task', date: '2024-02-29', completed: false });
    http.verify();
  });
});
