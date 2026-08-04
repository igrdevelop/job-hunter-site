import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

const PROTECTED_PREFIXES = [environment.apiBaseUrl, `${environment.authBaseUrl}/me`];

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
      }
      return throwError(() => error);
    }),
  );
};
