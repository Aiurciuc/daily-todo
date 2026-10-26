# Calendar

API-backed day/week/month calendar. No mock fixtures or in-memory persistence.

## Boundaries

- `calendar-preview.component.*`: navigation/range selection, filters, selected task, clock, clipboard, dialog and confirmation interactions. Projects persisted tasks into calendar layout; delegates all data loading and writes to the store.
- `calendar-api.service.ts`: typed GET, POST, PUT, PATCH completion and DELETE requests only. An undefined range skips loading until the page supplies its initial range.
- `state/calendar.store.ts`: small NgRx SignalStore composition root. **Provided by the calendar component, not globally.** Unmounting on logout, expiry or account change destroys cached state and cancels pending requests and callbacks.
- `state/with-calendar-data.ts`: reactive range binding, loading/load errors, persisted tasks, retry and cache reconciliation. Resource/cache internals are private; consumers receive read-only signals and commands.
- `state/with-calendar-mutations.ts`: guarded create/edit/completion/delete commands, shared pending lock, write errors, mutation notices and optimistic move lifecycle. Optional success callbacks let the page close dialogs/select tasks without coupling the store to DOM APIs.
- `state/with-calendar-sync.ts`: 10-second background reconciliation plus focus/visibility refresh; one request at a time, scoped to the current authenticated calendar. Hidden tabs and saves pause requests; errors preserve data and retry on the next tick.
- `state/calendar-task.helpers.ts`: pure layout mapping, full move draft construction/validation, schedule snapshots, task equality and safe mutation error messages.
- `calendar-preview.models.ts`: persisted task/draft/range contracts plus derived layout fields.
- `calendar-preview.utils.ts`: local date keys, Monday-first weeks, month cells and exact minute formatting (no UTC date shifting).
- `calendar-preview.data.ts`: view names, weekday names and 24-hour grid constants only.

Children receive signal inputs and emit typed outputs. Reusable visual controls come from `terra-ui`:

- `calendar-header/`, `calendar-toolbar/`, `mini-calendar/`: navigation and filters.
- `calendar-time-grid/`: 24-hour timeline, overlap lanes, sticky unscheduled strip and drag/slot selection.
- `calendar-month-view/`: tasks grouped by date, including unscheduled tasks.
- `task-details/`: persisted notes, schedule, sharing and guarded task actions.
- `urgent-tasks/`: upcoming incomplete tasks from the loaded range.
- `task-dialog/`: signal form, date/time validation, optional schedule, notes and sharing. Failed saves retain the draft.

## Data flow and invariants

1. The page supplies a range signal via `store.setRange(query)`. Filtering and selection are local UI state, not extra requests.
2. Create/edit/completion/delete reload only after success. Errors preserve the draft/data and show actionable feedback.
3. Moves patch only the affected cached task immediately. Neither success nor failure refetches the calendar; DOM and scroll position remain intact. Failure restores scheduling only and shows a red notice.
4. Corrections survive a GET that began before a move settled. The next fresh range read/reload supersedes them. Responses never insert an absent task into a different range or overwrite fresh metadata during rollback.
5. One write is accepted at a time; drag is also blocked while loading. Navigation remains available while saving.
6. Registered recipients see shared tasks read-only. The store checks `canEdit` for every existing-task mutation; the API independently enforces ownership. Legacy shared labels alone do not grant access.
7. Background sync fetches the full authorized range, not just currently shared IDs, so new shares and revoked/deleted/moved tasks reconcile correctly. It never sets foreground loading or resets selection/scroll. Unchanged responses preserve layout identities; changed data uses the grid's existing stale-drag cancellation. Older reads cannot overwrite a local move or rollback.

Task URLs use `?date=YYYY-MM-DD&task=<id>`. Times are floating local calendar minutes. No invitations, live push, projects, calls or attendees are implemented.

## Tests

- `state/calendar.store.spec.ts`: HTTP contracts, pending locks, permissions, load/retry, optimistic races/rollback, and destruction/account isolation without rendering the calendar.
- `state/calendar-sync.spec.ts`: exact polling interval, quiet reconciliation, visibility/focus, overlap/failure recovery, write/range races and teardown.
- `state/calendar-task.helpers.spec.ts`: pure schedule/layout validation and error formatting.
- `calendar-preview.component.spec.ts`: integration with selection, dialogs, navigation, readonly actions, notices and grid/scroll continuity.
- `e2e/calendar-drag.spec.ts`, `e2e/untimed-tasks.spec.ts`, `e2e/calendar-sync.spec.ts`: real-browser drag, sticky-strip and shared-task polling regressions with mocked HTTP.
