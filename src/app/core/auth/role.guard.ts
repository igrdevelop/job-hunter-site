import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Admin-only routes. Waits for the current user instead of reading
 * `currentUser()` synchronously: on a direct load (reload, bookmark) the
 * App constructor has only just started GET /auth/me, so the synchronous
 * read saw `null` and bounced the owner to /applications.
 * `resolveCurrentUser()` reuses that in-flight request — no second call.
 */
export const adminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = await authService.resolveCurrentUser();
  if (user?.role === 'admin') {
    return true;
  }

  return router.createUrlTree(['/applications']);
};
