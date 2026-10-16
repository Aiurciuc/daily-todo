# Terra UI

Reusable standalone Angular 22 components and native-control directives, extracted from the Stitch **Daily To-Do App Design** project (`9148549251451928979`) through MCP:

- **Terra Design System — Component Specification**, Terra v1.2 (`5b1b1a48ff2e464cb35674894598b8cf`): tokens, interaction states, navigation, calendar, forms.
- **Tempo UI Component Library (Terra Theme)** (`8678d4f990fe4ee6927b3fd17de1617b`): seven composite component definitions, including the inspector and urgent feed.

## Use in this workspace

Import symbols from `terra-ui`; `apps/web/tsconfig.json` maps that entry point to library source. Load `src/theme.scss` once in global styles (already done in `apps/web/src/styles.scss`). A packaged build includes `theme.scss` at its root for consumers to load with `@use 'terra-ui/theme'`.

```ts
import { TerraButton, TerraIcon, TerraTaskBlock } from 'terra-ui';
// Add these to a standalone component's imports.
```

```html
<button terraButton variant="secondary" size="compact" (click)="createTask()">
  <terra-icon name="add_circle" /> Block Time
</button>
<terra-task-block
  taskTitle="Design review" timeLabel="14:00 – 15:30"
  [shared]="true" [selected]="selected()"
  (activated)="selectTask()"
/>
```

The host supplies Nunito Sans, JetBrains Mono and Material Symbols Outlined fonts. The application already loads them. Override `--terra-*` semantic properties on a containing element to theme descendants. No Tailwind runtime, API, mock fixtures, global element resets or application services are required by the library.

## Public API and states

All presentation components use OnPush, signal inputs and typed outputs. Inputs are controlled by consumers; emitted events do not silently change parent-owned state.

| Export / selector | Inputs and states | Outputs / methods |
| --- | --- | --- |
| `TerraButton` / `button[terraButton]` | `variant`: primary, secondary, outlined, ghost; `size`: normal (36px), compact (32px), icon; default, hover, pressed, focus-visible, native disabled | Native click; `type` defaults to button, explicit submit/reset supported |
| `TerraField` / `[terraField]` | Native input/select/textarea; `invalid`; default/focus/error/disabled | Native input/change; consumer provides associated label/error text |
| `TerraCheckbox` / `input[terraCheckbox]` | Native checkbox or radio, checked/unchecked/focus/disabled | Native change; native forms and radio-group semantics retained |
| `TerraRadioCard` / `label[terraRadioCard]` | Project a native radio; checked/focus/disabled styles follow its state | Native label activation |
| `TerraIcon` / `terra-icon` | `name`; decorative Material Symbol | Label the enclosing interactive control |
| `TerraAvatarStack` / `terra-avatar-stack` | `people`: name, initials, optional color | Accessible named avatars |
| `TerraSegmentedFilter` / `terra-segmented-filter` | Required `options`, `value`, `label`; segment/pill `variant`; optional icon/count and per-option/group disabled | `valueChanged` |
| `TerraCalendarDayHeader` / `terra-calendar-day-header` | Required `weekday`, `day`; `active`, `accessibleLabel`, `disabled` | `selected` |
| `TerraTaskBlock` / `terra-task-block` | Required `taskTitle`, `timeLabel`; shared/private, selected, completed, disabled; `compact` title-only mode for short slots | `activated` |
| `TerraNowIndicator` / `terra-now-indicator` | `label`; host positions the line | Presentation only |
| `TerraMiniCalendarWidget` / `terra-mini-calendar-widget` | Required `month`, `cells`; customizable `weekdays`; current/outside-month, in-range, selected and disabled cells | `monthMoved` (-1/+1), `dateSelected` (Date) |
| `TerraTaskInspectorCard` / `terra-task-inspector-card` | Required `task`: title, time/date labels, visibility, completion, optional notes; `heading`; optional projected `[inspectorAction]` | `linkRequested`, `editRequested`, `completionToggled` |
| `TerraUrgentTaskRow` / `terra-urgent-task-row` | Required `taskTitle`; category, deadline, context, timeLabel, shared, urgent, disabled | `activated` |
| `TerraModal` / `terra-modal` | Required accessible `label`; projected content | `open()`, `close()`, `closed`; native dialog focus trap/Escape and backdrop dismissal |

Native controls remain compatible with Angular form bindings; directives are styling/semantics enhancements, not custom value accessors. A calendar supplies precomputed dates, layout coordinates and time labels. Modal content supplies validation and action buttons.

## Specification decisions

- Use the HTML v1.2 semantic palette for primitives: primary `#4a7c59`, canvas `#fcfbf7`, recessed `#f6f3eb`, border `#ede8dc`, ink `#3a3429`; retain the Markdown's shared/private and composite-specific palettes.
- The tinted button annotation says 12%, while its actual examples use 10/20/30%. Follow the rendered examples. Primary focus uses the illustrated 4px sage ring; secondary/outline use their illustrated 2px recipes.
- Use 12px component and 16px modal radii; documentation-card-only 14px corners are not component tokens.
- Retain useful completion, selection, disabled and short-slot states beyond the static examples. Real CSS pseudo-classes implement interaction states; they are not separate hardcoded mock variants.
- Keep date math, filtering, task creation, overlap lanes and application navigation in the feature. The library contains no fixture-specific dates or IDs; the application supplies real calendar dates and persisted task data.

## Integration

`apps/web/src/app/features/calendar-preview/` composes these primitives across the header, toolbar, timeline, mini-calendar, inspector, urgent list and task dialog. The dialog uses radio cards and validation. Projects, calls, and attendees are intentionally not supported. The page owns range/filter/selection state and API orchestration. Persisted date/minute fields are adapted into presentation inputs; the library itself never fetches data.

## Verify

From the repository root:

```sh
npm run build --workspace @local-todo/web  # library package + application
npm run test --workspace @local-todo/web   # application + library state/event tests
npm run lint --workspace @local-todo/web
```

`npm run build:ui --workspace @local-todo/web` builds only the publishable Angular package into `apps/web/dist/terra-ui`.
