import { Directive, input } from '@angular/core';
@Directive({
  selector: 'button[terraButton]',
  host: {
    class: 'terra-button',
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
    '[attr.type]': 'type()',
  },
})
export class TerraButton {
  readonly variant = input<'primary' | 'secondary' | 'outlined' | 'ghost'>('primary');
  readonly size = input<'normal' | 'compact' | 'icon'>('normal');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
}
