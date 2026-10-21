import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Auth } from './auth';

const user = { id: 1, name: 'Ada', email: 'ada@example.com' };

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { auth: TestBed.inject(Auth), http: TestBed.inject(HttpTestingController) };
}

async function signIn(auth: Auth, http: HttpTestingController) {
  const result = auth.login({ email: user.email, password: 'twelve-chars!' });
  const request = http.expectOne('/api/auth/login');
  expect(request.request.body).toEqual({ email: user.email, password: 'twelve-chars!' });
  expect(request.request.headers.has('Authorization')).toBe(false);
  request.flush(user);
  await result;
}

describe('Auth', () => {
  it('restores once and shares the pending request', async () => {
    const { auth, http } = setup();
    const first = auth.restore();
    expect(auth.restore()).toBe(first);
    expect(auth.state()).toBe('loading');
    http.expectOne('/api/auth/me').flush(user);
    await first;
    expect(auth.user()).toEqual(user);
    expect(auth.state()).toBe('authenticated');
    await auth.restore();
    http.expectNone('/api/auth/me');
    http.verify();
  });

  it('treats 401 as signed out, without retrying automatically', async () => {
    const { auth, http } = setup();
    const result = auth.restore();
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await result;
    expect(auth.state()).toBe('anonymous');
    expect(auth.user()).toBeNull();
    await auth.restore();
    http.verify();
  });

  it('keeps connection and server failures retryable rather than treating them as 401', async () => {
    const { auth, http } = setup();
    let result = auth.restore();
    http.expectOne('/api/auth/me').error(new ProgressEvent('error'));
    await result;
    expect(auth.state()).toBe('error');
    result = auth.restore(true);
    http.expectOne('/api/auth/me').flush({}, { status: 503, statusText: 'Unavailable' });
    await result;
    expect(auth.state()).toBe('error');
    result = auth.restore(true);
    http.expectOne('/api/auth/me').flush(user);
    await result;
    expect(auth.user()).toEqual(user);
    http.verify();
  });

  it('registers with only the contract fields and accepts the cookie session', async () => {
    const { auth, http } = setup();
    const credentials = { name: user.name, email: user.email, password: 'twelve-chars!' };
    const result = auth.register(credentials);
    const request = http.expectOne('/api/auth/register');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(credentials);
    request.flush(user);
    await result;
    expect(auth.user()).toEqual(user);
    http.verify();
  });

  it('clears identity after a successful logout', async () => {
    const { auth, http } = setup();
    await signIn(auth, http);
    const result = auth.logout();
    const request = http.expectOne('/api/auth/logout');
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await result;
    expect(auth.user()).toBeNull();
    expect(auth.state()).toBe('anonymous');
    http.verify();
  });

  it('retains the session on logout network failure, and accepts logout 401 as already signed out', async () => {
    const { auth, http } = setup();
    await signIn(auth, http);
    const failed = auth.logout();
    const rejection = expect(failed).rejects.toBeDefined();
    http.expectOne('/api/auth/logout').error(new ProgressEvent('error'));
    await rejection;
    expect(auth.user()).toEqual(user);
    const result = auth.logout();
    http.expectOne('/api/auth/logout').flush({}, { status: 401, statusText: 'Unauthorized' });
    await result;
    expect(auth.user()).toBeNull();
    http.verify();
  });

  it('rejects overlapping cookie mutations and ignores old request expiry after a new login', async () => {
    const { auth, http } = setup();
    const first = auth.login({ email: user.email, password: 'twelve-chars!' });
    await expect(auth.register({ ...user, password: 'twelve-chars!' })).rejects.toThrow(
      'already in progress',
    );
    http.expectNone('/api/auth/register');
    http.expectOne('/api/auth/login').flush(user);
    await first;
    const oldVersion = auth.sessionVersion;
    await signIn(auth, http);
    expect(auth.expire(oldVersion)).toBe(false);
    expect(auth.user()).toEqual(user);
    expect(auth.expire(auth.sessionVersion)).toBe(true);
    expect(auth.user()).toBeNull();
    http.verify();
  });

  it('does not let a delayed me response overwrite an explicit login', async () => {
    const { auth, http } = setup();
    const restoration = auth.restore();
    const me = http.expectOne('/api/auth/me');
    await signIn(auth, http);
    me.flush({ id: 99, name: 'Other', email: 'other@example.com' });
    await restoration;
    expect(auth.user()).toEqual(user);
    http.verify();
  });
});
