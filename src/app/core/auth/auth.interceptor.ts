import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

// `/auth/download-token` was missing from this list since the download-token
// flow shipped (2026-08-04): the bearer was never attached, the endpoint
// returned 401, and every `?dt=` file download on the site silently failed —
// found by the E2 live smoke run on its first execution (2026-09-02).
const PROTECTED_PREFIXES = [
  environment.apiBaseUrl,
  `${environment.authBaseUrl}/me`,
  `${environment.authBaseUrl}/download-token`,
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();
  const needsAuth = PROTECTED_PREFIXES.some((prefix) => req.url.startsWith(prefix));

  const authorizedReq = token && needsAuth
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authorizedReq).pipe(
    catchError((error) => {
      if (error?.status === 401 && needsAuth) {
        authService.logout();
      } else if (error?.status === 403 && needsAuth) {
        authService.needsEmailVerification.set(true);
      }
      return throwError(() => error);
    }),
  );
};
