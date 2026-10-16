import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TerraAvatar } from '../models';
@Component({
  selector: 'terra-avatar-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (person of people(); track $index) {
    <span
      role="img"
      [style.background]="person.color || null"
      [attr.title]="person.name"
      [attr.aria-label]="person.name"
      >{{ person.initials }}</span
    >
  }`,
  styles: `
    :host {
      display: inline-flex;
      padding-left: 5px;
    }
    span {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      margin-left: -5px;
      border: 2px solid white;
      border-radius: 50%;
      background: var(--terra-primary, #4a7c59);
      color: white;
      font:
        700 10px 'Nunito Sans',
        sans-serif;
    }
  `,
})
export class TerraAvatarStack {
  readonly people = input<readonly TerraAvatar[]>([]);
}
