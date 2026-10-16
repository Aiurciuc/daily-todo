import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TerraSegment } from '../models';
import { TerraIcon } from '../icon/icon';
@Component({
  selector: 'terra-segmented-filter',
  imports: [TerraIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.pills]': 'variant() === "pills"', role: 'group', '[attr.aria-label]': 'label()' },
  template: `@for (option of options(); track option.value) {
    <button
      type="button"
      [class.active]="value() === option.value"
      [attr.aria-pressed]="value() === option.value"
      [disabled]="disabled() || option.disabled"
      (click)="valueChanged.emit(option.value)"
    >
      @if (option.icon) {
        <terra-icon [name]="option.icon" />
      }
      {{ option.label }}
      @if (option.count !== undefined) {
        <span class="count">{{ option.count }}</span>
      }
    </button>
  }`,
  styles: `
    :host {
      display: inline-flex;
      gap: 2px;
      padding: 4px;
      border: 1px solid var(--terra-border, #ede8dc);
      border-radius: 12px;
      background: #ede9e0;
    }
    button {
      font:
        600 12px 'Nunito Sans',
        sans-serif;
      border: 0;
      border-radius: 8px;
      padding: 5px 12px;
      background: transparent;
      color: #736853;
      cursor: pointer;
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    button:hover:not(:disabled) {
      background: #dfdad0;
      color: #242019;
    }
    button.active {
      background: white;
      color: #242019;
      box-shadow: 0 1px 2px #0001;
    }
    button:focus-visible {
      outline: 2px solid var(--terra-primary, #4a7c59);
      outline-offset: 2px;
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    :host.pills {
      background: transparent;
      border: 0;
      padding: 0;
      gap: 6px;
    }
    :host.pills button {
      border-radius: 999px;
      background: #eae5dc;
      color: #3d3832;
    }
    :host.pills button.active {
      background: var(--terra-primary, #4a7c59);
      color: white;
    }
    .count {
      border-radius: 999px;
      background: #ffffffb3;
      padding: 0 5px;
      color: #4a7c59;
      font-size: 10px;
    }
    terra-icon {
      font-size: 13px;
    }
  `,
})
export class TerraSegmentedFilter<T extends string = string> {
  readonly options = input.required<readonly TerraSegment<T>[]>();
  readonly value = input.required<T>();
  readonly label = input.required<string>();
  readonly variant = input<'segments' | 'pills'>('segments');
  readonly disabled = input(false);
  readonly valueChanged = output<T>();
}
