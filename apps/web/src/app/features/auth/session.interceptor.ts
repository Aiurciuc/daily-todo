import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Auth } from './auth';
import { safeReturnUrl } from './auth-routing';

export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const version = auth.sessionVersion;
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        request.url.startsWith('/api/') &&
        !request.url.startsWith('/api/auth/') &&
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        auth.expire(version)
      ) {
        void router.navigate(['/login'], {
          queryParams: { returnUrl: safeReturnUrl(router.url), expired: '1' },
        });
      }
      return throwError(() => error);
    }),
  );
};
