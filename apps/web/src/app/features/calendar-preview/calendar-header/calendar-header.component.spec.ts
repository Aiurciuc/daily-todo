import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auth } from '../../auth/auth';
import { CalendarHeaderComponent } from './calendar-header.component';

describe('CalendarHeaderComponent', () => {
  it('shows only calendar views and emits navigation and creation', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: { user: signal(null) } }],
    });
    const fixture = TestBed.createComponent(CalendarHeaderComponent);
    fixture.componentRef.setInput('view', 'Week');
    fixture.componentRef.setInput('rangeStart', new Date(2026, 9, 19));
    fixture.componentRef.setInput('rangeEnd', new Date(2026, 9, 25));
    fixture.componentRef.setInput('offset', 0);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('terra-segmented-filter')).toHaveLength(1);
    expect(element.querySelector('[aria-label="Task visibility"]')).toBeNull();
    const moved = vi.fn();
    const today = vi.fn();
    const created = vi.fn();
    fixture.componentInstance.periodMoved.subscribe(moved);
    fixture.componentInstance.todayRequested.subscribe(today);
    fixture.componentInstance.createRequested.subscribe(created);
    element.querySelector<HTMLButtonElement>('[aria-label="Previous week"]')!.click();
    element.querySelector<HTMLButtonElement>('[aria-label="Next week"]')!.click();
    expect(moved.mock.calls).toEqual([[-1], [1]]);
    element.querySelector<HTMLButtonElement>('.today-label')!.click();
    expect(today).toHaveBeenCalledTimes(1);
    element.querySelector<HTMLButtonElement>('.topbar-right button')!.click();
    expect(created).toHaveBeenCalledTimes(1);
  });

  it('offers Day, Week and Month and emits Month selection', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: { user: signal(null) } }],
    });
    const fixture = TestBed.createComponent(CalendarHeaderComponent);
    fixture.componentRef.setInput('view', 'Week');
    fixture.componentRef.setInput('rangeStart', new Date(2026, 9, 19));
    fixture.componentRef.setInput('rangeEnd', new Date(2026, 9, 25));
    fixture.componentRef.setInput('month', new Date(2026, 9, 1));
    fixture.componentRef.setInput('offset', 0);
    await fixture.whenStable();

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.top-views button'),
    ) as HTMLButtonElement[];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Day', 'Week', 'Month']);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');

    const changed = vi.fn();
    fixture.componentInstance.viewChanged.subscribe(changed);
    buttons[2].click();
    await fixture.whenStable();
    expect(changed).toHaveBeenCalledExactlyOnceWith('Month');

    fixture.componentRef.setInput('view', 'Month');
    await fixture.whenStable();
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    expect(fixture.nativeElement.querySelector('.topbar-range').textContent).toContain('October 2026');
  });
});
