import { Directive, input } from '@angular/core';
@Directive({
  selector: 'input[terraField], select[terraField], textarea[terraField]',
  host: {
    class: 'terra-field',
    '[attr.aria-invalid]': 'invalid() ? "true" : null',
  },
})
export class TerraField {
  readonly invalid = input(false);
}
