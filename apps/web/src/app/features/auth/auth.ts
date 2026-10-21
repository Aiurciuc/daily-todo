import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface SessionUser {
  id: number;
  name: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly currentUser = signal<SessionUser | null>(null);
  private readonly sessionState = signal<'loading' | 'authenticated' | 'anonymous' | 'error'>(
    'loading',
  );
  readonly user = this.currentUser.asReadonly();
  readonly state = this.sessionState.asReadonly();
  private restoration?: Promise<void>;
  private version = 0;
  private changingSession = false;

  get sessionVersion(): number {
    return this.version;
  }

  restore(retry = false): Promise<void> {
    if (this.restoration) return this.restoration;
    if (
      this.state() === 'authenticated' ||
      this.state() === 'anonymous' ||
      (this.state() === 'error' && !retry)
    )
      return Promise.resolve();
    this.sessionState.set('loading');
    const version = this.version;
    this.restoration = firstValueFrom(this.http.get<SessionUser>('/api/auth/me'))
      .then((user) => {
        if (version === this.version) this.accept(user);
      })
      .catch((error: unknown) => {
        if (version !== this.version) return;
        if (error instanceof HttpErrorResponse && error.status === 401) this.clear();
        else this.sessionState.set('error');
      })
      .finally(() => {
        this.restoration = undefined;
      });
    return this.restoration;
  }

  login(credentials: { email: string; password: string }): Promise<void> {
    return this.authenticate('login', credentials);
  }

  register(credentials: { name: string; email: string; password: string }): Promise<void> {
    return this.authenticate('register', credentials);
  }

  private async authenticate(
    endpoint: 'login' | 'register',
    credentials: { name?: string; email: string; password: string },
  ): Promise<void> {
    // Serialize cookie-changing requests, even if a form is destroyed mid-request.
    if (this.changingSession) throw new Error('A session request is already in progress.');
    this.changingSession = true;
    this.version++;
    try {
      this.accept(
        await firstValueFrom(this.http.post<SessionUser>('/api/auth/' + endpoint, credentials)),
      );
    } finally {
      this.changingSession = false;
    }
  }

  async logout(): Promise<void> {
    if (this.changingSession) throw new Error('A session request is already in progress.');
    this.changingSession = true;
    try {
      try {
        await firstValueFrom(this.http.post<void>('/api/auth/logout', {}));
      } catch (error: unknown) {
        if (!(error instanceof HttpErrorResponse) || error.status !== 401) throw error;
      }
      this.clear();
    } finally {
      this.changingSession = false;
    }
  }

  expire(version: number): boolean {
    if (version !== this.version || !this.user()) return false;
    this.clear();
    return true;
  }

  private accept(user: SessionUser): void {
    this.version++;
    this.currentUser.set(user);
    this.sessionState.set('authenticated');
  }

  private clear(): void {
    this.version++;
    this.currentUser.set(null);
    this.sessionState.set('anonymous');
  }
}
