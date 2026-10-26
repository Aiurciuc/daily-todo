import { DOCUMENT } from '@angular/common';
import { effect, inject, Signal } from '@angular/core';
import { signalStoreFeature, withHooks } from '@ngrx/signals';
import {
  catchError,
  EMPTY,
  exhaustMap,
  filter,
  fromEvent,
  interval,
  merge,
  takeUntil,
  tap,
} from 'rxjs';
import { CalendarApiService } from '../calendar-api.service';
import { CalendarRange, PersistedCalendarTask } from '../calendar-preview.models';

interface CalendarSyncSource {
  api: CalendarApiService;
  range: Signal<CalendarRange | undefined>;
  tasks: Signal<PersistedCalendarTask[]>;
  loading: Signal<boolean>;
  saving: Signal<boolean>;
  hasValue(): boolean;
  apply(tasks: PersistedCalendarTask[]): void;
}

/** Quiet reconciliation, scoped to the authenticated calendar's lifetime. */
export function withCalendarSync(source: CalendarSyncSource) {
  return signalStoreFeature(
    withHooks({
      onInit() {
        const document = inject(DOCUMENT);
        const window = document.defaultView;
        if (!window) return;
        const visibilityChanges = fromEvent(document, 'visibilitychange');
        const visible = () => document.visibilityState !== 'hidden';
        const ready = () => !source.loading() && !source.saving() && source.hasValue();
        effect((onCleanup) => {
          // Recreating this subscription also cancels a read when navigating or writing.
          const range = source.range();
          if (!range || !ready()) return;
          const subscription = merge(
            interval(10_000),
            fromEvent(window, 'focus'),
            visibilityChanges,
          )
            .pipe(
              filter(() => visible() && ready()),
              exhaustMap(() => {
                const cached = source.tasks();
                return source.api.fetchRange(range).pipe(
                  takeUntil(visibilityChanges.pipe(filter(() => !visible()))),
                  tap((tasks) => {
                    // A write or foreground read may have finished before effect cleanup ran.
                    // Never let an older response overwrite a move, rollback or another range.
                    if (
                      visible() &&
                      ready() &&
                      source.range() === range &&
                      source.tasks() === cached
                    ) {
                      source.apply(tasks);
                    }
                  }),
                  // Keep the current calendar and try again on the next tick. The auth
                  // interceptor still handles 401s and unmounts the private calendar.
                  catchError(() => EMPTY),
                );
              }),
            )
            .subscribe();
          onCleanup(() => subscription.unsubscribe());
        });
      },
    }),
  );
}
