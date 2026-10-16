import { Directive } from '@angular/core';
@Directive({ selector: 'input[terraCheckbox]', host: { class: 'terra-checkbox' } })
export class TerraCheckbox {}
