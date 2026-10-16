# Calendar

API-backed day/week/month calendar. No mock fixtures or in-memory persistence.

## Responsibilities

- `calendar-preview.component.*`: range navigation, resource reads, selection, filters, loading/error/empty states and guarded mutations.
- `calendar-api.service.ts`: typed range GET, POST, PUT, PATCH completion and DELETE requests.
- `calendar-preview.models.ts`: canonical persisted task/draft contracts plus derived layout fields.
- `calendar-preview.utils.ts`: local date keys, Monday-first weeks, month cells and exact minute formatting (no UTC date shifting).
- `calendar-preview.data.ts`: view names, weekday names and 24-hour grid constants only.
- `calendar-header/`, `calendar-toolbar/`, `mini-calendar/`: navigation and filters.
- `calendar-time-grid/`: full 24-hour timeline, overlap lanes, unscheduled tasks and slot selection.
- `calendar-month-view/`: actual tasks grouped by date, including unscheduled tasks.
- `task-details/`: persisted notes, schedule, team label and task actions.
- `urgent-tasks/`: upcoming incomplete tasks from the loaded range, not a fabricated urgency flag.
- `task-dialog/`: create/edit native form, date/time validation, optional schedule, notes and labels. The dialog retains drafts on failed saves.

Children receive signal inputs and emit typed outputs; API orchestration stays in the page. Reusable visual controls come from `terra-ui`. Writes are disabled while pending and reads reload only after success. HTTP errors are shown explicitly. Task URLs use `?date=YYYY-MM-DD&task=<id>`.

Times are floating local calendar minutes; shared/private and team names are display labels, not authorization. Projects, calls and attendees are not supported. The application has no authentication and must stay on a trusted local network.
