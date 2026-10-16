import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
@Component({
  selector: 'terra-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<dialog
    #dialog
    [attr.aria-label]="label()"
    (click)="backdrop($event)"
    (close)="closed.emit()"
  >
    <ng-content />
  </dialog>`,
  styles: `
    dialog {
      box-sizing: border-box;
      width: min(480px, calc(100% - 32px));
      max-height: calc(100dvh - 48px);
      overflow: auto;
      margin: auto;
      padding: 24px;
      border: 1px solid var(--terra-border, #ede8dc);
      border-radius: 16px;
      background: white;
      color: var(--terra-ink, #3a3429);
      font:
        13px 'Nunito Sans',
        sans-serif;
      box-shadow: 0 16px 64px #2e323026;
    }
    dialog::backdrop {
      background: #2e323055;
      backdrop-filter: blur(3px);
    }
  `,
})
export class TerraModal {
  readonly label = input.required<string>();
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  open(): void {
    const el = this.dialog().nativeElement;
    if (!el.open) el.showModal();
  }
  close(): void {
    this.dialog().nativeElement.close();
  }
  protected backdrop(event: MouseEvent): void {
    const el = this.dialog().nativeElement;
    if (event.target !== el) return;
    const r = el.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      this.close();
  }
}
