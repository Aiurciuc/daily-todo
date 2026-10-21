import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './features/auth/auth-routing';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/auth-page/auth-page.component').then((m) => m.AuthPageComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    data: { register: true },
    loadComponent: () =>
      import('./features/auth/auth-page/auth-page.component').then((m) => m.AuthPageComponent),
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/private-calendar/private-calendar.component').then(
        (m) => m.PrivateCalendarComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
