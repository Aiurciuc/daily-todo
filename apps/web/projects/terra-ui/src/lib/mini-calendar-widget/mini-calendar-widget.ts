import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TerraCalendarCell } from '../models';
import { TerraButton } from '../button';
import { TerraIcon } from '../icon/icon';
@Component({
  selector: 'terra-mini-calendar-widget',
  imports: [DatePipe, TerraButton, TerraIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="mini-calendar" aria-label="Choose date">
    <header>
      <h2>{{ month() | date: 'MMMM yyyy' }}</h2>
      <div>
        <button
          terraButton
          variant="ghost"
          size="icon"
          aria-label="Previous month"
          (click)="monthMoved.emit(-1)"
        >
          <terra-icon name="chevron_left" />
        </button>
        <button
          terraButton
          variant="ghost"
          size="icon"
          aria-label="Next month"
          (click)="monthMoved.emit(1)"
        >
          <terra-icon name="chevron_right" />
        </button>
      </div>
    </header>
    <div class="mini-weekdays">
      @for (day of weekdays(); track $index) {
        <span>{{ day }}</span>
      }
    </div>
    <div class="mini-days">
      @for (cell of cells(); track $index) {
        <button
          type="button"
          [class.muted]="!cell.current"
          [class.in-week]="cell.inRange"
          [class.selected]="cell.selected"
          [disabled]="cell.disabled"
          [attr.aria-pressed]="!!cell.selected"
          [attr.aria-label]="cell.date | date: 'fullDate'"
          (click)="dateSelected.emit(cell.date)"
        >
          {{ cell.date | date: 'd' }}
        </button>
      }
    </div>
  </section>`,
  styles: `
    :host {
      display: block;
    }
    section {
      padding: 18px;
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
      justify-content: space-between;
      margin-bottom: 16px;
    }
    h2 {
      margin: 0;
      font-size: 14px;
    }
    header > div {
      display: flex;
    }
    .mini-weekdays,
    .mini-days {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      text-align: center;
      gap: 4px 0;
    }
    .mini-weekdays {
      font-size: 10px;
      color: #8c8477;
      margin-bottom: 8px;
    }
    .mini-days button {
      width: 28px;
      height: 28px;
      margin: auto;
      border: 0;
      border-radius: 50%;
      background: none;
      color: inherit;
      cursor: pointer;
      font: inherit;
    }
    .mini-days button:hover {
      background: #e5ece6;
    }
    .mini-days .muted {
      color: #b5afa6;
    }
    .mini-days .in-week {
      background: #f4f7f4;
    }
    .mini-days .selected {
      background: var(--terra-primary, #4a7c59);
      color: white;
    }
    .mini-days button:focus-visible {
      outline: 2px solid var(--terra-primary, #4a7c59);
      outline-offset: 2px;
    }
    .mini-days button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `,
})
export class TerraMiniCalendarWidget {
  readonly month = input.required<Date>();
  readonly cells = input.required<readonly TerraCalendarCell[]>();
  readonly weekdays = input<readonly string[]>(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  readonly monthMoved = output<number>();
  readonly dateSelected = output<Date>();
}
