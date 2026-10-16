import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TerraIcon } from '../icon/icon';
@Component({
  selector: 'terra-urgent-task-row',
  imports: [TerraIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    type="button"
    class="urgent-task"
    [disabled]="disabled()"
    (click)="activated.emit()"
  >
    <span class="urgent-meta"
      ><span [class.shared-label]="shared()">
        @if (!shared()) {
          <terra-icon name="lock" />
        }
        {{ category() }}</span
      ><span [class.deadline]="urgent()">{{ deadline() }}</span></span
    ><strong>{{ taskTitle() }}</strong
    ><span class="urgent-footer"
      ><span>{{ context() }}</span
      ><span>{{ timeLabel() }}</span></span
    >
  </button>`,
  styles: `
    :host {
      display: block;
    }
    button {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 7px;
      width: 100%;
      padding: 12px;
      border: 1px solid #eee9df;
      border-radius: 12px;
      background: #faf8f4;
      text-align: left;
      color: #3a3429;
      font:
        12px 'Nunito Sans',
        sans-serif;
      cursor: pointer;
    }
    button:hover {
      background: #f3efe6;
    }
    button:focus-visible {
      outline: 2px solid var(--terra-primary, #4a7c59);
      outline-offset: 2px;
    }
    button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .urgent-meta,
    .urgent-footer {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      font-size: 10px;
      color: #8c8477;
    }
    .urgent-meta > span:first-child {
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .shared-label {
      color: #4a7c59;
    }
    .deadline {
      color: #c2410c;
      font-weight: 700;
    }
    terra-icon {
      font-size: 12px;
    }
    strong {
      font-size: 12px;
    }
  `,
})
export class TerraUrgentTaskRow {
  readonly taskTitle = input.required<string>();
  readonly category = input('');
  readonly deadline = input('');
  readonly context = input('');
  readonly timeLabel = input('');
  readonly shared = input(false);
  readonly urgent = input(false);
  readonly disabled = input(false);
  readonly activated = output<void>();
}
