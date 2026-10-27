import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TerraTaskDetails } from '../models';
import { TerraIcon } from '../icon/icon';
import { TerraButton } from '../button';
@Component({
  selector: 'terra-task-inspector-card',
  imports: [TerraIcon, TerraButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="details" aria-label="Selected task">
    <header>
      <h2>{{ heading() }}</h2>
      <span class="badge" [class.private]="!task().shared">{{
        task().shared ? 'Shared' : 'Private'
      }}</span>
      <div>
        <button
          terraButton
          size="icon"
          variant="ghost"
          aria-label="Copy task link"
          (click)="linkRequested.emit()"
        >
          <terra-icon name="link" />
        </button>
        @if (canEdit()) {
          <button
            terraButton
            size="icon"
            variant="ghost"
            aria-label="Edit task"
            (click)="editRequested.emit()"
          >
            <terra-icon name="edit" />
          </button>
        }
      </div>
    </header>
    <h3>{{ task().title }}</h3>
    <p class="time">
      <terra-icon name="schedule" /> {{ task().timeLabel }} · {{ task().dateLabel }}
    </p>
    <ng-content select="[inspectorSharing]" />
    <h4>Agenda & Notes</h4>
    <p class="notes">{{ task().notes || 'No notes added.' }}</p>
    <div class="detail-actions">
      <ng-content select="[inspectorAction]" />
      @if (canEdit()) {
        <button
          terraButton
          variant="outlined"
          class="secondary"
          [attr.aria-pressed]="!!task().completed"
          (click)="completionToggled.emit()"
        >
          <terra-icon name="check_circle" />{{
            task().completed ? 'Reopen task' : 'Mark Completed'
          }}
        </button>
      }
    </div>
  </section>`,
  styles: `
    :host {
      display: block;
    }
    section {
      padding: 20px;
      border: 1px solid var(--terra-border, #ede8dc);
      border-radius: 12px;
      background: white;
      color: var(--terra-ink, #3a3429);
      font:
        12px 'Nunito Sans',
        sans-serif;
    }
    header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    header > div {
      display: flex;
      margin-left: auto;
    }
    h2 {
      font-size: 14px;
      margin: 0;
    }
    h3 {
      font-size: 16px;
      line-height: 1.4;
      margin: 18px 0 8px;
    }
    h4 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #736853;
      margin: 20px 0 8px;
    }
    .badge {
      font-size: 10px;
      padding: 3px 7px;
      border-radius: 999px;
      background: #d8e6db;
      color: #2d4f37;
    }
    .badge.private {
      background: #eae5dc;
      color: #6b6256;
    }
    .time {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: #736853;
      line-height: 1.6;
    }
    .time terra-icon {
      font-size: 15px;
      color: #4a7c59;
    }
    .notes {
      padding: 12px;
      background: #fcfbf9;
      border: 1px solid #f0ede6;
      border-radius: 8px;
      line-height: 1.8;
      margin: 0;
    }
    .detail-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 20px;
    }
  `,
})
export class TerraTaskInspectorCard {
  readonly task = input.required<TerraTaskDetails>();
  readonly heading = input('Task Details');
  readonly canEdit = input(true);
  readonly linkRequested = output<void>();
  readonly editRequested = output<void>();
  readonly completionToggled = output<void>();
}
