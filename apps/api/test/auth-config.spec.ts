import { describe, expect, it } from 'vitest';
import { authConfig, authSettings } from '../src/auth/auth.config';

describe('auth configuration', () => {
  it('uses deterministic defaults without reading the process environment', () => {
    expect(authSettings({})).toEqual({
      trustedProxyIps: [],
      sessionTtlSeconds: 604800,
      secureCookie: false,
      origin: undefined,
    });
    expect(authConfig.KEY).toBe('CONFIGURATION(auth)');
  });

  it('defaults to secure cookies only in production and honors explicit overrides', () => {
    expect(authSettings({ NODE_ENV: 'production' }).secureCookie).toBe(true);
    expect(authSettings({ NODE_ENV: 'test' }).secureCookie).toBe(false);
    expect(authSettings({ NODE_ENV: 'development' }).secureCookie).toBe(false);
    expect(authSettings({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' }).secureCookie).toBe(
      false,
    );
    expect(authSettings({ AUTH_COOKIE_SECURE: 'true' }).secureCookie).toBe(true);
  });

  it('accepts only explicit proxy IPs, never broad trust or hostnames', () => {
    expect(authSettings({ AUTH_TRUSTED_PROXY_IPS: '127.0.0.1, ::1' }).trustedProxyIps).toEqual(['127.0.0.1', '::1']);
    for (const value of ['*', 'true', 'loopback', '10.0.0.0/8', '', '127.0.0.1,']) {
      expect(() => authSettings({ AUTH_TRUSTED_PROXY_IPS: value })).toThrow();
    }
  });

  it.each(['http://localhost', 'http://localhost:4200', 'https://todo.example'])(
    'accepts the explicit exact origin %s',
    (origin) => {
      expect(authSettings({ AUTH_ORIGIN: origin }).origin).toBe(origin);
    },
  );

  it.each([
    '',
    'null',
    'not a url',
    'ftp://todo.example',
    'https://todo.example/',
    'https://todo.example/path',
    'https://todo.example?query=1',
    'https://todo.example#hash',
    'https://user:password@todo.example',
  ])('rejects invalid origin %j', (origin) => {
    expect(() => authSettings({ AUTH_ORIGIN: origin })).toThrow();
  });

  it.each(['', 'TRUE', 'False', '1', '0', 'yes'])('rejects invalid secure flag %j', (secure) => {
    expect(() => authSettings({ AUTH_COOKIE_SECURE: secure })).toThrow(
      'AUTH_COOKIE_SECURE must be true or false',
    );
  });

  it.each(['60', '2592000', '3600'])('accepts session lifetime %s', (ttl) => {
    expect(authSettings({ AUTH_SESSION_TTL_SECONDS: ttl }).sessionTtlSeconds).toBe(Number(ttl));
  });

  it.each([
    '',
    '0',
    '-1',
    '59',
    '2592001',
    '60.5',
    'NaN',
    'Infinity',
    'invalid',
    '9007199254740992',
  ])('rejects invalid session lifetime %j', (ttl) => {
    expect(() => authSettings({ AUTH_SESSION_TTL_SECONDS: ttl })).toThrow(
      'AUTH_SESSION_TTL_SECONDS must be between 60 and 2592000',
    );
  });
});
