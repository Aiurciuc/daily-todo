import { computed, inject, signal } from '@angular/core';
import {
  patchState,
  signalStoreFeature,
  withComputed,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { distinctUntilChanged, pipe, tap } from 'rxjs';
import { CalendarApiService } from '../calendar-api.service';
import { CalendarRange, PersistedCalendarTask } from '../calendar-preview.models';
import { sameCalendarTasks, taskSchedule, TaskSchedule } from './calendar-task.helpers';

/** Range reads and local scheduling reconciliation; no view/dialog state. */
export function withCalendarData() {
  return signalStoreFeature(
    withState<{ _range: CalendarRange | undefined }>({ _range: undefined }),
    withProps(() => ({ _api: inject(CalendarApiService) })),
    withProps((store) => ({ _resource: store._api.list(store._range) })),
    withProps(() => ({
      // A GET started before PUT completion may still return the old schedule.
      // Only starting a fresh read invalidates these corrections, not completing one.
      _moveSchedules: signal(new Map<number, TaskSchedule>()),
    })),
    withComputed((store) => ({
      loading: computed(() => store._resource.isLoading()),
      loadError: computed(() =>
        store._resource.error() ? 'Unable to load tasks. Check the API/database connection.' : '',
      ),
      tasks: computed(() => {
        const corrections = store._moveSchedules();
        return (store._resource.hasValue() ? store._resource.value() : []).map((task) => ({
          ...task,
          ...corrections.get(task.id),
        }));
      }),
    })),
    withMethods((store) => ({
      setRange: rxMethod<CalendarRange>(
        pipe(
          distinctUntilChanged((a, b) => a.from === b.from && a.to === b.to),
          tap((range) => {
            store._moveSchedules.set(new Map());
            patchState(store, { _range: range });
          }),
        ),
      ),
      reload(): void {
        if (store._resource.reload()) store._moveSchedules.set(new Map());
      },
      _syncCachedTasks(tasks: PersistedCalendarTask[]): void {
        if (store._resource.isLoading() || !store._resource.hasValue()) return;
        if (sameCalendarTasks(store.tasks(), tasks)) return;
        store._moveSchedules.set(new Map());
        store._resource.set(tasks);
      },
      _replaceCachedTask(task: PersistedCalendarTask, scheduleOnly = false): void {
        const schedule = taskSchedule(task);
        store._moveSchedules.update((schedules) => new Map(schedules).set(task.id, schedule));
        // Never insert an old task into a new range or cancel an in-flight GET.
        if (
          store._resource.isLoading() ||
          !store._resource.hasValue() ||
          !store._resource.value().some((item) => item.id === task.id)
        )
          return;
        store._resource.update((items) =>
          items?.map((item) =>
            item.id === task.id ? (scheduleOnly ? { ...item, ...schedule } : task) : item,
          ),
        );
      },
    })),
  );
}
