import { signalStore, withFeature } from '@ngrx/signals';
import { withCalendarData } from './with-calendar-data';
import { withCalendarMutations } from './with-calendar-mutations';
import { withCalendarSync } from './with-calendar-sync';

// Provided by CalendarPreviewComponent, never in root: requests and private
// cached state are destroyed when the authenticated calendar is unmounted.
export const CalendarStore = signalStore(
  withCalendarData(),
  withFeature((store) =>
    withCalendarMutations({
      api: store._api,
      tasks: store.tasks,
      loading: store.loading,
      replaceCachedTask: store._replaceCachedTask,
      reload: store.reload,
    }),
  ),
  withFeature((store) =>
    withCalendarSync({
      api: store._api,
      range: store._range,
      tasks: store.tasks,
      loading: store.loading,
      saving: store.saving,
      hasValue: () => store._resource.hasValue(),
      apply: store._syncCachedTasks,
    }),
  ),
);
