import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { adminGuard } from './core/auth/role.guard';

const loadFiles = () =>
  import('./features/files/files.component').then((m) => m.FilesComponent);

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
            path: '',
            loadComponent: () =>
              import('./features/profile/profile.component').then((m) => m.ProfileComponent),
          },
        ],
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
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
