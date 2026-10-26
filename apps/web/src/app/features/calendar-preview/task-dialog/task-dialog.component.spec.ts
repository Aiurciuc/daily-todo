import { TestBed } from '@angular/core/testing';
import { TaskDialogComponent } from './task-dialog.component';

describe('TaskDialogComponent', () => {
  async function render() {
    const fixture = TestBed.createComponent(TaskDialogComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const modal = element.querySelector('dialog')!;
    modal.showModal = vi.fn();
    modal.close = vi.fn();
    fixture.componentInstance.open('2026-10-15', 14.5);
    return { fixture, element, modal };
  }

  it('sets the real date and emits the API contract without closing before persistence', async () => {
    const { fixture, element, modal } = await render();
    const created = vi.fn();
    fixture.componentInstance.taskCreated.subscribe(created);
    element.querySelector<HTMLInputElement>('[name="title"]')!.value = '  Focus time  ';
    element.querySelector<HTMLTextAreaElement>('[name="notes"]')!.value = 'Stored note';
    element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(created).toHaveBeenCalledWith({
      title: 'Focus time',
      date: '2026-10-15',
      startMinute: 870,
      durationMinutes: 60,
      visibility: 'PRIVATE',
      notes: 'Stored note',
      sharedWith: null,
    });
    expect(modal.close).not.toHaveBeenCalled();
    fixture.componentInstance.close();
    expect(modal.close).toHaveBeenCalledOnce();
  });

  it('requires a valid recipient only for shared tasks and normalizes email', async () => {
    const { fixture, element } = await render();
    const created = vi.fn();
    fixture.componentInstance.taskCreated.subscribe(created);
    expect(element.querySelector<HTMLInputElement>('[value="PRIVATE"]')!.checked).toBe(true);
    element.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Shared task';
    const recipient = element.querySelector<HTMLInputElement>('[name="sharedWith"]')!;
    const submit = () =>
      element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const recipientField = recipient.closest<HTMLElement>('.recipient-field')!;
    const visibilityFieldset = element.querySelector('fieldset fieldset')!;
    expect(recipientField.hidden).toBe(true);
    expect(visibilityFieldset.nextElementSibling).toBe(recipientField);
    expect(recipient.disabled).toBe(true);
    element.querySelector<HTMLInputElement>('[value="SHARED"]')!.click();
    await fixture.whenStable();
    expect(recipientField.hidden).toBe(false);
    expect(recipient.required).toBe(true);
    expect(recipient.type).toBe('email');
    expect(recipient.maxLength).toBe(254);
    submit();
    expect(created).not.toHaveBeenCalled();
    recipient.value = 'not-an-email';
    submit();
    expect(created).not.toHaveBeenCalled();
    recipient.value = ' Recipient@Example.COM ';
    submit();
    expect(created).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visibility: 'SHARED',
        sharedWith: 'recipient@example.com',
      }),
    );
    element.querySelector<HTMLInputElement>('[value="PRIVATE"]')!.click();
    await fixture.whenStable();
    expect(recipientField.hidden).toBe(true);
    expect(recipient.value).toBe('');
    expect(recipient.required).toBe(false);
    submit();
    expect(created).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visibility: 'PRIVATE',
        sharedWith: null,
      }),
    );
  });

  it('rejects blank titles and schedules that cross midnight', async () => {
    const { fixture, element } = await render();
    const created = vi.fn();
    fixture.componentInstance.taskCreated.subscribe(created);
    const submit = () =>
      element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    element.querySelector<HTMLInputElement>('[name="title"]')!.value = '   ';
    submit();
    await fixture.whenStable();
    expect(element.textContent).toContain('Enter a task name');
    fixture.componentInstance.open('2026-10-15', 23.5);
    element.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Late task';
    submit();
    await fixture.whenStable();
    expect(element.textContent).toContain('must end within');
    expect(created).not.toHaveBeenCalled();
  });

  it('supports unscheduled tasks and keeps drafts with server errors', async () => {
    const { fixture, element } = await render();
    const created = vi.fn();
    fixture.componentInstance.taskCreated.subscribe(created);
    element.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Unscheduled task';
    element.querySelector<HTMLInputElement>('[name="unscheduled"]')!.click();
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(created).toHaveBeenCalledWith(
      expect.objectContaining({ startMinute: null, durationMinutes: null }),
    );
    fixture.componentRef.setInput('error', 'Could not save changes');
    await fixture.whenStable();
    expect(element.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe(
      'Unscheduled task',
    );
    expect(element.textContent).toContain('Could not save changes');
    fixture.componentRef.setInput('saving', true);
    await fixture.whenStable();
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });

  it('closes after persistence even before the saving input has propagated', async () => {
    const { fixture, modal } = await render();
    fixture.componentRef.setInput('saving', true);
    await fixture.whenStable();
    fixture.componentInstance.close();
    expect(modal.close).not.toHaveBeenCalled();
    fixture.componentInstance.close(true);
    expect(modal.close).toHaveBeenCalledOnce();
  });

  it('edits actual metadata and clears it when opening a fresh task', async () => {
    const { fixture, element } = await render();
    fixture.componentInstance.edit({
      id: 9,
      title: 'Existing',
      date: '2026-10-16',
      day: 4,
      start: 9.25,
      duration: 0.75,
      shared: true,
      notes: 'Actual notes',
      sharedWith: 'recipient@example.com',
    });
    await fixture.whenStable();
    expect(element.querySelector<HTMLInputElement>('[name="time"]')!.value).toBe('09:15');
    expect(element.querySelector<HTMLInputElement>('[name="duration"]')!.value).toBe('45');
    expect(element.querySelector<HTMLInputElement>('[value="SHARED"]')!.checked).toBe(true);
    expect(element.querySelector<HTMLInputElement>('[name="sharedWith"]')!.required).toBe(true);
    expect(element.querySelector<HTMLElement>('.recipient-field')!.hidden).toBe(false);
    expect(element.querySelector<HTMLInputElement>('[name="sharedWith"]')!.value).toBe(
      'recipient@example.com',
    );
    expect(element.querySelector<HTMLTextAreaElement>('[name="notes"]')!.value).toBe(
      'Actual notes',
    );
    fixture.componentInstance.open('2026-10-17');
    await fixture.whenStable();
    expect(element.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('');
    expect(element.querySelector<HTMLInputElement>('[value="PRIVATE"]')!.checked).toBe(true);
    expect(element.querySelector<HTMLInputElement>('[name="sharedWith"]')!.disabled).toBe(true);
    expect(element.querySelector<HTMLElement>('.recipient-field')!.hidden).toBe(true);
  });
});
