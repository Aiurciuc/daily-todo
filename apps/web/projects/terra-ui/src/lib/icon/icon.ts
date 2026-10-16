import { ChangeDetectionStrategy, Component, input } from '@angular/core';
@Component({
  selector: 'terra-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: '{{ name() }}',
  styles: `
    :host {
      font-family: 'Material Symbols Outlined';
      font-weight: normal;
      font-style: normal;
      font-size: 18px;
      line-height: 1;
      display: inline-block;
      white-space: nowrap;
      font-feature-settings: 'liga';
      -webkit-font-smoothing: antialiased;
    }
  `,
})
export class TerraIcon {
  readonly name = input.required<string>();
}
