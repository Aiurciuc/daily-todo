import { ChangeDetectionStrategy, Component, input } from '@angular/core';
@Component({
  selector: 'terra-now-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  template: '<span></span>',
  styles: `
    :host {
      display: block;
      position: absolute;
      left: 0;
      right: 0;
      height: 2px;
      background: #b83230;
      pointer-events: none;
      z-index: 2;
    }
    span {
      position: absolute;
      top: -4px;
      left: -5px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #b83230;
    }
  `,
})
export class TerraNowIndicator {
  readonly label = input.required<string>();
}
