import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';

// Only this application's calendar is a valid destination; keep query links intact.
export function safeReturnUrl(value: string | null): string {
  if (!value || !/^\/(?:[?#]|$)/.test(value) || /[\\\\\r\n]/.test(value)) return '/';
  return value;
}

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.restore();
  // A failed connection is not a signed-out session. The shell offers retry.
  return auth.user() || auth.state() === 'error'
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = async (route) => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.restore();
  return auth.user() ? router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl'))) : true;
};
