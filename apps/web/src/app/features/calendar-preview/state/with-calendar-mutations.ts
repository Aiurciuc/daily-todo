import { DestroyRef, inject, Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { patchState, signalStoreFeature, withMethods, withState } from '@ngrx/signals';
import { Observable } from 'rxjs';
import { CalendarApiService } from '../calendar-api.service';
import { NewCalendarTask, PersistedCalendarTask } from '../calendar-preview.models';
import { calendarMutationError, taskMoveDraft } from './calendar-task.helpers';

export interface CalendarNotice {
  kind: 'success' | 'error';
  message: string;
}

interface CalendarMutationSource {
  api: CalendarApiService;
  tasks: Signal<PersistedCalendarTask[]>;
  loading: Signal<boolean>;
  replaceCachedTask(task: PersistedCalendarTask, scheduleOnly?: boolean): void;
  reload(): void;
}

type SavedTaskHandler = (task: PersistedCalendarTask) => void;

/** Owns write lifecycle, permissions, optimistic moves, rollback and feedback. */
export function withCalendarMutations(source: CalendarMutationSource) {
  return signalStoreFeature(
    withState({ saving: false, mutationError: '', notice: null as CalendarNotice | null }),
    withMethods((store, destroyRef = inject(DestroyRef)) => {
      const editableTask = (id: number) =>
        source.tasks().find((task) => task.id === id && task.canEdit !== false);
      const begin = () => patchState(store, { saving: true, mutationError: '', notice: null });
      const mutate = <T>(request: Observable<T>, message: string, onSaved?: (value: T) => void) => {
        if (store.saving()) return;
        begin();
        request.pipe(takeUntilDestroyed(destroyRef)).subscribe({
          next: (value) => {
            patchState(store, { saving: false, notice: { kind: 'success', message } });
            onSaved?.(value);
            source.reload();
          },
          error: (error: unknown) =>
            patchState(store, { saving: false, mutationError: calendarMutationError(error) }),
        });
      };
      return {
        clearMutationError(): void {
          patchState(store, { mutationError: '' });
        },
        dismissNotice(): void {
          patchState(store, { notice: null });
        },
        createTask(draft: NewCalendarTask, onSaved?: SavedTaskHandler): void {
          mutate(source.api.create(draft), 'Task created.', onSaved);
        },
        updateTask(id: number, draft: NewCalendarTask, onSaved?: SavedTaskHandler): void {
          if (editableTask(id)) mutate(source.api.update(id, draft), 'Task updated.', onSaved);
        },
        toggleCompleted(id: number): void {
          const task = editableTask(id);
          if (task)
            mutate(
              source.api.setCompleted(id, !task.completed),
              task.completed ? 'Task reopened.' : 'Task completed.',
            );
        },
        deleteTask(id: number, onDeleted?: () => void): void {
          if (editableTask(id)) mutate(source.api.remove(id), 'Task deleted.', onDeleted);
        },
        moveTask(id: number, date: string, startMinute: number | null): boolean {
          const previous = editableTask(id);
          if (!previous || store.saving() || source.loading()) return false;
          const draft = taskMoveDraft(previous, date, startMinute);
          if (!draft) return false;
          begin();
          source.replaceCachedTask({ ...previous, ...draft });
          source.api
            .update(id, draft)
            .pipe(takeUntilDestroyed(destroyRef))
            .subscribe({
              next: (saved) => {
                source.replaceCachedTask(saved);
                patchState(store, {
                  saving: false,
                  notice: { kind: 'success', message: 'Task moved.' },
                });
              },
              error: (error: unknown) => {
                source.replaceCachedTask(previous, true);
                patchState(store, {
                  saving: false,
                  notice: {
                    kind: 'error',
                    message:
                      'Could not move task. ' +
                      calendarMutationError(error) +
                      ' Previous position restored.',
                  },
                });
              },
            });
          return true;
        },
      };
    }),
  );
}
