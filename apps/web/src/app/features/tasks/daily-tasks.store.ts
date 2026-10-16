import { computed, inject, signal } from '@angular/core';
import { form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { tapResponse } from '@ngrx/operators';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Observable, concatMap, pipe } from 'rxjs';
import { Task } from './task.model';
import { adjacentDay, localToday } from './task-date';
import { TasksService } from './tasks.service';

type Intent =
  | { kind: 'add'; title: string }
  | { kind: 'completion'; id: number; completed: boolean }
  | { kind: 'reorder'; ids: number[] };
type Mutation = { token: number; day: string; intent: Intent; visit: number };
type DayWrites = { base: Task[]; pending: Mutation[] };
export type TaskToast = { id: number; day: string; kind: 'success' | 'error'; message: string };

// Absolute order intents preserve the latest drop even if an earlier drop fails.
// Newly added tasks not present in a captured order remain at the end.
function ordered(tasks: Task[], ids: number[]): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return [
    ...ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    ...tasks.filter((task) => !ids.includes(task.id)),
  ];
}
function project({ base, pending }: DayWrites): Task[] {
  return pending.reduce((tasks, { intent }) => {
    if (intent.kind === 'reorder') return ordered(tasks, intent.ids);
    if (intent.kind === 'completion')
      return tasks.map((task) =>
        task.id === intent.id ? { ...task, completed: intent.completed } : task,
      );
    return tasks;
  }, base);
}

// Component-scoped: reads and the serialized write queue clean up on destruction.
export const DailyTasksStore = signalStore(
  withState(() => ({
    day: localToday(),
    _visit: 0,
    _sequence: 0,
    _writes: {} as Record<string, DayWrites>,
    _reloadDays: [] as string[],
    _toasts: [] as TaskToast[],
  })),
  withProps(() => ({ _taskService: inject(TasksService), _formModel: signal({ title: '' }) })),
  withProps((store) => ({ _resource: store._taskService.list(store.day) })),
  withComputed((store) => ({
    loading: computed(() => store._resource.isLoading()),
    tasks: computed(() => {
      const writes = store._writes()[store.day()];
      return writes ? project(writes) : store._resource.hasValue() ? store._resource.value() : [];
    }),
    error: computed(() => (store._resource.error() ? 'Unable to load tasks.' : '')),
    toasts: computed(() => store._toasts()),
    previousDay: computed(() => adjacentDay(store.day(), -1)),
    nextDay: computed(() => adjacentDay(store.day(), 1)),
    canAdd: computed(
      () =>
        !store._resource.isLoading() &&
        (store._resource.hasValue() || !!store._writes()[store.day()]),
    ),
  })),
  withProps((store) => ({
    taskForm: form(store._formModel, (path) => {
      required(path.title, { message: 'Enter a task title.' });
      maxLength(path.title, 200, { message: 'Use at most 200 characters.' });
      validate(path.title, ({ value }) =>
        value().trim() ? undefined : { kind: 'blank', message: 'Enter a task title.' },
      );
    }),
  })),
  withMethods((store) => ({
    _mutate: rxMethod<Mutation>(
      pipe(
        concatMap((mutation) => {
          const { day, intent, token, visit } = mutation;
          const base = store._writes()[day].base;
          const request: Observable<Task | Task[]> =
            intent.kind === 'add'
              ? store._taskService.add(intent.title, day)
              : intent.kind === 'completion'
                ? store._taskService.setCompleted(intent.id, intent.completed)
                : store._taskService.reorder(
                    day,
                    ordered(base, intent.ids).map((task) => task.id),
                  );
          const finish = (saved?: Task | Task[]) => {
            const writes = store._writes()[day];
            let base = writes.base;
            if (saved) {
              if (Array.isArray(saved)) base = saved;
              else if (intent.kind === 'add') base = [...base, saved];
              else base = base.map((task) => (task.id === saved.id ? saved : task));
            }
            const operation =
              intent.kind === 'add'
                ? 'add task'
                : intent.kind === 'completion'
                  ? 'update task'
                  : 'reorder tasks';
            patchState(store, {
              _writes: {
                ...store._writes(),
                [day]: { base, pending: writes.pending.filter((item) => item.token !== token) },
              },
              _toasts: [
                ...store._toasts(),
                {
                  id: token,
                  day,
                  kind: saved ? 'success' : 'error',
                  message: `${saved ? 'Saved: ' + operation + '.' : 'Unable to ' + operation + '.'} (${day})`,
                },
              ],
            });
            // A requested refresh waits for this day's accepted writes to settle.
            if (!store._writes()[day].pending.length && store._reloadDays().includes(day)) {
              const remaining = { ...store._writes() };
              delete remaining[day];
              patchState(store, {
                _writes: remaining,
                _reloadDays: store._reloadDays().filter((value) => value !== day),
              });
              if (store.day() === day) {
                store._resource.set(base);
                store._resource.reload();
              }
            }
            // Never overwrite a newer draft or another visit's form after a failed add.
            if (
              !saved &&
              intent.kind === 'add' &&
              store.day() === day &&
              store._visit() === visit &&
              !store._formModel().title
            )
              store.taskForm().reset({ title: intent.title });
          };
          return request.pipe(
            tapResponse({ next: (saved) => finish(saved), error: () => finish() }),
          );
        }),
      ),
    ),
  })),
  withMethods((store) => ({
    _enqueue(intent: Intent): void {
      const day = store.day();
      const token = store._sequence() + 1;
      const mutation = { token, day, intent, visit: store._visit() };
      const writes = store._writes()[day] ?? { base: store.tasks(), pending: [] };
      patchState(store, {
        _sequence: token,
        _writes: {
          ...store._writes(),
          [day]: { ...writes, pending: [...writes.pending, mutation] },
        },
      });
      store._mutate(mutation);
    },
  })),
  withMethods((store) => ({
    move(offset: number): void {
      const next = adjacentDay(store.day(), offset);
      if (!next) return;
      // Settled days are read afresh on the next visit. Pending days retain their
      // authoritative response base, so a racing GET cannot undo accepted writes.
      const writes = Object.fromEntries(
        Object.entries(store._writes()).filter(([, value]) => value.pending.length > 0),
      );
      patchState(store, { day: next, _visit: store._visit() + 1, _writes: writes });
    },
    retry(): void {
      if (store._writes()[store.day()]?.pending.length) {
        if (!store._reloadDays().includes(store.day())) {
          patchState(store, { _reloadDays: [...store._reloadDays(), store.day()] });
        }
        return;
      }
      if (store.loading()) return;
      const writes = { ...store._writes() };
      delete writes[store.day()];
      patchState(store, { _writes: writes });
      store._resource.reload();
    },
    dismissToast(id: number): void {
      patchState(store, { _toasts: store._toasts().filter((toast) => toast.id !== id) });
    },
    async add(): Promise<void> {
      if (!store.canAdd()) return;
      // Only validation uses a promise; all HTTP writes belong to rxMethod.
      await submit(store.taskForm, async () => {
        const title = store._formModel().title.trim();
        store.taskForm().reset({ title: '' });
        store._enqueue({ kind: 'add', title });
      });
    },
    reorder({
      previousIndex,
      currentIndex,
      taskId,
    }: {
      previousIndex: number;
      currentIndex: number;
      taskId?: number;
    }): void {
      const tasks = store.tasks();
      // The projection may change during a drag when an earlier write settles.
      const sourceIndex =
        taskId === undefined ? previousIndex : tasks.findIndex((task) => task.id === taskId);
      if (
        !store.canAdd() ||
        sourceIndex === currentIndex ||
        !Number.isInteger(sourceIndex) ||
        !Number.isInteger(currentIndex) ||
        sourceIndex < 0 ||
        currentIndex < 0 ||
        sourceIndex >= tasks.length ||
        currentIndex >= tasks.length
      )
        return;
      const reordered = [...tasks];
      const [task] = reordered.splice(sourceIndex, 1);
      reordered.splice(currentIndex, 0, task);
      store._enqueue({ kind: 'reorder', ids: reordered.map((item) => item.id) });
    },
    setCompleted(task: Task): void {
      if (!store.canAdd()) return;
      const current = store.tasks().find((item) => item.id === task.id);
      if (current)
        store._enqueue({ kind: 'completion', id: current.id, completed: !current.completed });
    },
  })),
);
