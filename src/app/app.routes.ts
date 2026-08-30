import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { adminGuard } from './core/auth/role.guard';

const loadFiles = () =>
  import('./features/files/files.component').then((m) => m.FilesComponent);
const loadProfileFiles = () =>
  import('./features/profile/profile.component').then((m) => m.ProfileComponent);

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'verify',
    loadComponent: () => import('./features/verify/verify.component').then((m) => m.VerifyComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: 'applications',
        loadComponent: () =>
          import('./features/applications/applications.component').then(
            (m) => m.ApplicationsComponent,
          ),
      },
      { path: 'files/:date/:company', loadComponent: loadFiles },
      { path: 'files/:date', loadComponent: loadFiles },
      { path: 'files', loadComponent: loadFiles },
      // Legacy URL — Templates now lives under Profile.
      { path: 'templates', redirectTo: 'profile/templates' },
      {
        path: 'stats',
        loadComponent: () => import('./features/stats/stats.component').then((m) => m.StatsComponent),
      },
      {
        path: 'profile',
        children: [
          {
            path: 'templates',
            loadComponent: () =>
              import('./features/templates/templates.component').then(
                (m) => m.TemplatesComponent,
              ),
          },
          {
            // Candidate-file browser, at any depth: /profile/files, /profile/files/examples/x, …
            // "files" (like "templates" above) is a reserved top-level segment under
            // /profile — a real candidate folder literally named "files" would be
            // shadowed at this exact URL, same accepted tradeoff as "templates".
            // It's still reachable one level deeper, e.g. /profile/files/files.
            path: 'files',
            children: [
              { path: '', loadComponent: loadProfileFiles },
              { path: '**', loadComponent: loadProfileFiles },
            ],
          },
          {
            path: '',
            loadComponent: () =>
              import('./features/profile-editor/profile-editor.component').then(
                (m) => m.ProfileEditorComponent,
              ),
          },
          {
            // Legacy deep links: /profile/<path> → /profile/files/<path>. Builds a
            // UrlTree (not a bare string) so query params and the fragment carry
            // over — a redirectTo string only forwards them via positional :param
            // placeholders, which this redirect doesn't have. Matrix params on
            // individual segments are not round-tripped; this app doesn't use them
            // anywhere in its own routing.
            path: '**',
            redirectTo: (data) => {
              const segments = data.url.map((s) => s.path);
              return inject(Router).createUrlTree(['/profile', 'files', ...segments], {
                queryParams: data.queryParams,
                fragment: data.fragment ?? undefined,
              });
            },
          },
        ],
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'filters',
        loadComponent: () =>
          import('./features/filters/filters.component').then((m) => m.FiltersComponent),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/admin.component').then((m) => m.AdminComponent),
      },
      { path: '', redirectTo: 'applications', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
