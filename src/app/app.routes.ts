import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { candidateFilesMatcher } from './features/files/files.routes';

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
        matcher: candidateFilesMatcher,
        loadComponent: () =>
          import('./features/files/files.component').then((m) => m.FilesComponent),
      },
      {
        path: 'generated',
        loadComponent: () =>
          import('./features/generated/generated.component').then((m) => m.GeneratedComponent),
      },
      {
        path: 'generated/:date',
        loadComponent: () =>
          import('./features/generated/generated.component').then((m) => m.GeneratedComponent),
      },
      {
        path: 'generated/:date/:company',
        loadComponent: () =>
          import('./features/generated/generated.component').then((m) => m.GeneratedComponent),
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
      { path: '', redirectTo: 'applications', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
