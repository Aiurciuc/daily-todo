import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, inject, Signal } from '@angular/core';
import { CalendarRange, NewCalendarTask, PersistedCalendarTask } from './calendar-preview.models';

@Injectable({ providedIn: 'root' })
export class CalendarApiService {
  private readonly http = inject(HttpClient);

  list(range: Signal<CalendarRange | undefined>) {
    return httpResource<PersistedCalendarTask[]>(() => {
      const params = range();
      return params ? { url: '/api/tasks', params: { ...params } } : undefined;
    });
  }

  fetchRange(range: CalendarRange) {
    return this.http.get<PersistedCalendarTask[]>('/api/tasks', { params: { ...range } });
  }

  create(task: NewCalendarTask) {
    return this.http.post<PersistedCalendarTask>('/api/tasks', task);
  }

  update(id: number, task: NewCalendarTask) {
    return this.http.put<PersistedCalendarTask>(`/api/tasks/${id}`, task);
  }

  setCompleted(id: number, completed: boolean) {
    return this.http.patch<PersistedCalendarTask>(`/api/tasks/${id}`, { completed });
  }

  remove(id: number) {
    return this.http.delete<void>(`/api/tasks/${id}`);
  }
}
