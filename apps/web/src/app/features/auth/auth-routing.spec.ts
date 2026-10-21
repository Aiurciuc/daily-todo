import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Auth } from './auth';
import { authGuard, safeReturnUrl } from './auth-routing';
import { routes } from '../../app.routes';
import { AppComponent } from '../../app.component';

const user = { id: 1, name: 'Ada', email: 'ada@example.com' };

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
  });
  return {
    auth: TestBed.inject(Auth),
    http: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
  };
}

describe('auth routing and session retry', () => {
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/login',
    '/register',
    '/%2f%2fevil.test',
    '/\n/evil.test',
    'javascript:alert(1)',
  ])('rejects unsafe or non-calendar returnUrl %s', (url) => {
    expect(safeReturnUrl(url)).toBe('/');
  });

  it('preserves calendar query strings and fragments', () => {
    expect(safeReturnUrl('/?task=7&date=2026-10-21#details')).toBe(
      '/?task=7&date=2026-10-21#details',
    );
  });

  it('redirects signed-out calendar navigation to login preserving query links', async () => {
    const { auth, http, router } = setup();
    const restore = auth.restore();
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await restore;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/?task=7&date=2026-10-21');
    const url = router.parseUrl(router.url);
    expect(router.url.startsWith('/login?')).toBe(true);
    expect(url.queryParams['returnUrl']).toBe('/?task=7&date=2026-10-21');
    expect(harness.routeNativeElement?.querySelector('app-calendar-preview')).toBeNull();
    http.expectNone((request) => request.url === '/api/tasks');
    http.verify();
  });

  it('allows an authenticated calendar and redirects authenticated login visits to their task link', async () => {
    const { auth, http, router } = setup();
    const restore = auth.restore();
    http.expectOne('/api/auth/me').flush(user);
    await restore;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/login?returnUrl=' + encodeURIComponent('/?task=7&date=2026-10-21'),
    );
    expect(router.url).toBe('/?task=7&date=2026-10-21');
    expect(harness.routeNativeElement?.querySelector('app-calendar-preview')).not.toBeNull();
    await TestBed.tick();
    http.match((request) => request.url === '/api/tasks').forEach((request) => request.flush([]));
    http.verify();
  });

  it('does not turn a session connection error into a login redirect', async () => {
    const { http, auth } = setup();
    const guard = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/?task=7' } as RouterStateSnapshot),
    );
    http.expectOne('/api/auth/me').error(new ProgressEvent('error'));
    expect(await guard).toBe(true);
    expect(auth.state()).toBe('error');
    http.verify();
  });

  it.each([true, false])(
    'reconciles a successful session retry on login (authenticated=%s)',
    async (authenticated) => {
      const { http, router } = setup();
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      http.expectOne('/api/auth/me').error(new ProgressEvent('error'));
      await fixture.whenStable();
      await router.navigateByUrl(
        '/login?returnUrl=' + encodeURIComponent('/?task=7&date=2026-10-21'),
      );
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'We couldn’t check your session',
      );
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')!.click();
      const retry = http.expectOne('/api/auth/me');
      if (authenticated) retry.flush(user);
      else retry.flush({}, { status: 401, statusText: 'Unauthorized' });
      if (authenticated) {
        await vi.waitFor(() => expect(router.url).toBe('/?task=7&date=2026-10-21'));
        await TestBed.tick();
        http
          .match((request) => request.url === '/api/tasks')
          .forEach((request) => request.flush([]));
        await fixture.whenStable();
        fixture.detectChanges();
      } else {
        await fixture.whenStable();
        fixture.detectChanges();
        expect(router.url.startsWith('/login?')).toBe(true);
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('Welcome back');
      }
      http.verify();
    },
  );
});
