import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { Auth } from '../auth';
import { AuthPageComponent } from './auth-page.component';

async function setup(register = false, returnUrl = '/?task=7&date=2026-10-21') {
  const auth = {
    user: signal(null),
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
  };
  await TestBed.configureTestingModule({
    imports: [AuthPageComponent],
    providers: [
      provideRouter([]),
      { provide: Auth, useValue: auth },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { data: { register }, queryParamMap: convertToParamMap({ returnUrl }) },
        },
      },
    ],
  }).compileComponents();
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(AuthPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, auth, navigate, element: fixture.nativeElement as HTMLElement };
}

function fill(fixture: ComponentFixture<AuthPageComponent>, id: string, value: string) {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#' + id)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur'));
  fixture.detectChanges();
}

function send(fixture: ComponentFixture<AuthPageComponent>) {
  (fixture.nativeElement as HTMLElement)
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
}

describe('AuthPageComponent', () => {
  it('has accessible labels, correct autocomplete, and shows required errors on submit', async () => {
    const { fixture, element, auth } = await setup(true);
    for (const id of ['name', 'email', 'password', 'confirmation']) {
      expect(element.querySelector(`label[for="${id}"]`)).not.toBeNull();
      expect(element.querySelector('#' + id)?.getAttribute('aria-describedby')).toContain(
        id + '-errors',
      );
    }
    expect(element.querySelector('#password')?.getAttribute('autocomplete')).toBe('new-password');
    send(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Enter your name.');
    expect(element.textContent).toContain('Enter your email address.');
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('validates name/email limits and password length/confirmation', async () => {
    const { fixture, element, auth } = await setup(true);
    fill(fixture, 'name', 'a'.repeat(121));
    fill(fixture, 'email', 'a'.repeat(243) + '@example.com');
    fill(fixture, 'password', 'short');
    fill(fixture, 'confirmation', 'different');
    send(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Use no more than 120 characters.');
    expect(element.textContent).toContain('Use no more than 254 characters.');
    expect(element.textContent).toContain('Use at least 8 characters.');
    expect(element.textContent).toContain('Passwords must match.');
    fill(fixture, 'password', 'p'.repeat(129));
    fixture.detectChanges();
    expect(element.textContent).toContain('Use no more than 128 characters.');
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('accepts the backend minimum eight-character password on login', async () => {
    const { fixture, auth } = await setup();
    fill(fixture, 'email', 'ada@example.com');
    fill(fixture, 'password', 'eight123');
    send(fixture);
    await fixture.whenStable();
    expect(auth.login).toHaveBeenCalledExactlyOnceWith({ email: 'ada@example.com', password: 'eight123' });
  });

  it('toggles visibility for both passwords without submitting', async () => {
    const { fixture, element, auth } = await setup(true);
    const toggle = element.querySelector<HTMLButtonElement>('[aria-controls]')!;
    expect(toggle.type).toBe('button');
    toggle.click();
    fixture.detectChanges();
    expect(element.querySelector<HTMLInputElement>('#password')!.type).toBe('text');
    expect(element.querySelector<HTMLInputElement>('#confirmation')!.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    fixture.detectChanges();
    expect(element.querySelector<HTMLInputElement>('#password')!.type).toBe('password');
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('sends only registration fields, trims the name and preserves password characters', async () => {
    const { fixture, auth } = await setup(true);
    fill(fixture, 'name', '  Ada  ');
    fill(fixture, 'email', 'ada@example.com');
    fill(fixture, 'password', '  twelve-chars!  ');
    fill(fixture, 'confirmation', '  twelve-chars!  ');
    send(fixture);
    await fixture.whenStable();
    expect(auth.register).toHaveBeenCalledExactlyOnceWith({
      name: 'Ada',
      email: 'ada@example.com',
      password: '  twelve-chars!  ',
    });
  });

  it('prevents duplicate submissions while pending and shows an actionable login error', async () => {
    const { fixture, element, auth } = await setup();
    let reject!: (error: unknown) => void;
    auth.login.mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    fill(fixture, 'email', 'ada@example.com');
    fill(fixture, 'password', 'twelve-chars!');
    send(fixture);
    await Promise.resolve();
    fixture.detectChanges();
    expect(element.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('#email')!.disabled).toBe(true);
    expect(element.textContent).toContain('Signing in…');
    send(fixture);
    expect(auth.login).toHaveBeenCalledTimes(1);
    reject(new HttpErrorResponse({ status: 401 }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Email or password is incorrect.',
    );
    expect(element.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(false);
    expect(element.querySelector('#confirmation')).toBeNull();
  });

  it.each([
    [409, 'An account with this email already exists.'],
    [0, 'We couldn’t connect. Please try again.'],
    [429, 'Too many attempts.'],
  ])('shows registration request errors for status %s', async (status, message) => {
    const { fixture, element, auth } = await setup(true);
    auth.register.mockRejectedValue(new HttpErrorResponse({ status }));
    fill(fixture, 'name', 'Ada');
    fill(fixture, 'email', 'ada@example.com');
    fill(fixture, 'password', 'twelve-chars!');
    fill(fixture, 'confirmation', 'twelve-chars!');
    send(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(message);
  });

  it('preserves the internal task link when switching flow', async () => {
    const { element } = await setup();
    const link = element.querySelector<HTMLAnchorElement>('a')!;
    const url = new URL(link.href);
    expect(url.pathname).toBe('/register');
    expect(url.searchParams.get('returnUrl')).toBe('/?task=7&date=2026-10-21');
  });
});
