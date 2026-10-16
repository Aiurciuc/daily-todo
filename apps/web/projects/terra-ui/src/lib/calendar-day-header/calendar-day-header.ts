import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
@Component({
  selector: 'terra-calendar-day-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    type="button"
    class="day-heading"
    [class.current]="active()"
    [disabled]="disabled()"
    [attr.aria-pressed]="active()"
    [attr.aria-label]="accessibleLabel() || weekday() + ' ' + day()"
    (click)="selected.emit()"
  >
    <span>{{ weekday() }}</span
    ><strong>{{ day() }}</strong>
  </button>`,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    button {
      box-sizing: border-box;
      width: calc(100% - 8px);
      height: 100%;
      margin: 0 4px;
      padding: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      border: 0;
      border-radius: 12px;
      background: none;
      color: #736c61;
      cursor: pointer;
      font:
        600 11px 'Nunito Sans',
        sans-serif;
    }
    strong {
      font-size: 14px;
      color: #2d2822;
    }
    .current {
      background: #d8e6db99;
      color: #4a7c59;
    }
    .current strong {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--terra-primary, #4a7c59);
      color: white;
    }
    button:hover {
      background: #d8e6db66;
    }
    button:focus-visible {
      outline: 2px solid var(--terra-primary, #4a7c59);
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `,
})
export class TerraCalendarDayHeader {
  readonly weekday = input.required<string>();
  readonly day = input.required<string | number>();
  readonly active = input(false);
  readonly disabled = input(false);
  readonly accessibleLabel = input('');
  readonly selected = output<void>();
}
