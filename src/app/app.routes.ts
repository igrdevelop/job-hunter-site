import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
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
      {
        path: 'files',
        loadComponent: () => import('./features/files/files.component').then((m) => m.FilesComponent),
      },
      {
        path: 'files/:date',
        loadComponent: () => import('./features/files/files.component').then((m) => m.FilesComponent),
      },
      {
        path: 'files/:date/:company',
        loadComponent: () => import('./features/files/files.component').then((m) => m.FilesComponent),
      },
      {
        path: 'templates',
        loadComponent: () =>
          import('./features/templates/templates.component').then(
            (m) => m.TemplatesComponent,
          ),
      },
      {
        path: 'stats',
        loadComponent: () => import('./features/stats/stats.component').then((m) => m.StatsComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      { path: '', redirectTo: 'applications', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
