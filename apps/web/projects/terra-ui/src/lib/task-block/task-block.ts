import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TerraIcon } from '../icon/icon';
@Component({
  selector: 'terra-task-block',
  imports: [TerraIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    type="button"
    class="calendar-task"
    [class.shared]="shared()"
    [class.compact]="compact()"
    [class.completed]="completed()"
    [class.selected]="selected()"
    [disabled]="disabled()"
    [attr.aria-pressed]="selected()"
    [attr.aria-label]="
      taskTitle() +
      ', ' +
      timeLabel() +
      (shared() ? ', Shared' : ', Private') +
      (completed() ? ', Completed' : '')
    "
    (click)="activated.emit()"
  >
    @if (!compact()) {
      <span class="task-time">{{ timeLabel() }}</span>
    }
    <strong>{{ taskTitle() }}</strong>
    @if (!compact()) {
      <span class="context">
        @if (!shared()) {
          <terra-icon name="lock" />
        }
        {{ shared() ? 'Shared' : 'Private' }}
      </span>
    }
  </button>`,
  styles: `
    :host {
      display: block;
      min-width: 0;
      min-height: 0;
    }
    button {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      gap: 2px;
      overflow: hidden;
      text-align: left;
      border: 1px solid var(--terra-private-border, #dbd4c7);
      border-radius: 12px;
      background: var(--terra-private, #eae5dc);
      color: #3d3832;
      cursor: pointer;
      font:
        600 11px 'Nunito Sans',
        sans-serif;
      transition:
        box-shadow 150ms,
        transform 100ms;
    }
    button.shared {
      background: var(--terra-shared, #d8e6db);
      border-color: var(--terra-shared-border, #c2d6c6);
      color: #2d4f37;
    }
    button:hover:not(:disabled) {
      box-shadow: 0 4px 8px #0002;
    }
    button:active:not(:disabled) {
      transform: scale(0.98);
    }
    button:focus-visible,
    .selected {
      outline: 2px solid var(--terra-primary, #4a7c59);
      outline-offset: 1px;
    }
    strong {
      flex-shrink: 0;
      font-size: 12px;
      line-height: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .task-time {
      flex-shrink: 0;
      font-size: 10px;
      line-height: 12px;
    }
    .context {
      flex-shrink: 0;
      line-height: 12px;
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 10px;
    }
    terra-icon {
      font-size: 12px;
    }
    button.compact {
      padding: 2px 6px;
      gap: 0;
    }
    button.compact strong {
      font-size: 10px;
    }
    button.completed {
      opacity: 0.55;
    }
    .completed strong {
      text-decoration: line-through;
    }
    button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `,
})
export class TerraTaskBlock {
  readonly taskTitle = input.required<string>();
  readonly timeLabel = input.required<string>();
  readonly compact = input(false);
  readonly shared = input(false);
  readonly completed = input(false);
  readonly selected = input(false);
  readonly disabled = input(false);
  readonly activated = output<void>();
}
