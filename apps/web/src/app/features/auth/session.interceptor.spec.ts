import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { Auth } from './auth';
import { sessionInterceptor } from './session.interceptor';

const user = { id: 1, name: 'Ada', email: 'ada@example.com' };

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      provideHttpClient(withInterceptors([sessionInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const auth = TestBed.inject(Auth);
  const http = TestBed.inject(HttpTestingController);
  const restored = auth.restore();
  http.expectOne('/api/auth/me').flush(user);
  await restored;
  return { auth, http, router: TestBed.inject(Router), client: TestBed.inject(HttpClient) };
}

describe('session expiry and private calendar lifecycle', () => {
  it('clears identity, unmounts the private calendar and preserves the query link on task 401', async () => {
    const { auth, http, router, client } = await setup();
    const harness = await RouterTestingHarness.create('/?task=7&date=2026-10-21');
    await TestBed.tick();
    http.expectOne((request) => request.url === '/api/tasks').flush([]);
    const privateCalendar = harness.routeDebugElement!.componentInstance;
    expect(harness.routeNativeElement?.querySelector('app-calendar-preview')).not.toBeNull();
    client.get('/api/tasks/7').subscribe({ error: () => undefined });
    http.expectOne('/api/tasks/7').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull();
    // Check the signal-driven teardown even before navigation finishes.
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-calendar-preview')).toBeNull();
    await harness.fixture.whenStable();
    expect(router.url.startsWith('/login?')).toBe(true);
    expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe('/?task=7&date=2026-10-21');
    const login = auth.login({ email: user.email, password: 'twelve-chars!' });
    http.expectOne('/api/auth/login').flush(user);
    await login;
    await vi.waitFor(() => expect(router.url).toBe('/?task=7&date=2026-10-21'));
    await TestBed.tick();
    http.match((request) => request.url === '/api/tasks').forEach((request) => request.flush([]));
    await harness.fixture.whenStable();
    await router.navigateByUrl('/?task=7&date=2026-10-21');
    harness.detectChanges();
    expect(harness.routeDebugElement!.componentInstance).not.toBe(privateCalendar);
    await TestBed.tick();
    http.match((request) => request.url === '/api/tasks').forEach((request) => request.flush([]));
    http.verify();
  });

  it('does not intercept auth 401s, retry failed requests, or clear the user for non-401 failures', async () => {
    const { auth, http, client, router } = await setup();
    const navigate = vi.spyOn(router, 'navigate');
    client.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    http.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    client.get('/api/tasks').subscribe({ error: () => undefined });
    http.expectOne('/api/tasks').flush({}, { status: 500, statusText: 'Server Error' });
    client.get('https://other.test/api/tasks').subscribe({ error: () => undefined });
    http
      .expectOne('https://other.test/api/tasks')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toEqual(user);
    expect(navigate).not.toHaveBeenCalled();
    http.verify();
  });

  it('ignores a late 401 from a previous session', async () => {
    const { auth, http, client } = await setup();
    client.get('/api/tasks/7').subscribe({ error: () => undefined });
    const old = http.expectOne('/api/tasks/7');
    const login = auth.login({ email: 'new@example.com', password: 'twelve-chars!' });
    const next = { id: 2, name: 'New user', email: 'new@example.com' };
    http.expectOne('/api/auth/login').flush(next);
    await login;
    old.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toEqual(next);
    http.verify();
  });

  it('shows current identity, reports logout errors and destroys private UI on logout success', async () => {
    const { auth, http, router } = await setup();
    const harness = await RouterTestingHarness.create('/');
    await TestBed.tick();
    http.expectOne((request) => request.url === '/api/tasks').flush([]);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Ada');
    const logoutButton = () =>
      Array.from(harness.routeNativeElement!.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Sign out',
      )!;
    logoutButton().click();
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Signing out…');
    http.expectOne('/api/auth/logout').error(new ProgressEvent('error'));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(auth.user()).toEqual(user);
    expect(harness.routeNativeElement?.textContent).toContain('Could not sign out.');
    logoutButton().click();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(auth.user()).toBeNull();
    expect(router.url).toBe('/login');
    expect(harness.routeNativeElement?.querySelector('app-calendar-preview')).toBeNull();
    http.verify();
  });
});
