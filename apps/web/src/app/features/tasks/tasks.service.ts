import { HttpClient, httpResource } from '@angular/common/http';
import { Signal } from '@angular/core';
import { Injectable, inject } from '@angular/core';

import { Task } from './task.model';

@Injectable({ providedIn: 'root' })
export class TasksService {
  readonly http = inject(HttpClient);

  list(day: Signal<string>) {
    return httpResource<Task[]>(() => ({ url: '/api/tasks', params: { date: day() } }), {
      defaultValue: [],
    });
  }

  add(title: string, date: string) {
    return this.http.post<Task>('/api/tasks', { title, date });
  }

  reorder(date: string, ids: number[]) {
    return this.http.patch<Task[]>('/api/tasks/order', { date, ids });
  }

  setCompleted(id: number, completed: boolean) {
    return this.http.patch<Task>(`/api/tasks/${id}`, { completed });
  }
}
