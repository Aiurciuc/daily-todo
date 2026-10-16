import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideHttpClient()],
}).catch((error: unknown) => console.error('Unable to start the daily tasks app', error));
