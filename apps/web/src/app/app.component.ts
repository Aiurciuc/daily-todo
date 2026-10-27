import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TerraButton } from 'terra-ui';
import { Auth } from './features/auth/auth';
import { safeReturnUrl } from './features/auth/auth-routing';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TerraButton],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly auth = inject(Auth);
  private readonly router = inject(Router);

  constructor() {
    void this.auth.restore();
  }

  async retrySession(): Promise<void> {
    await this.auth.restore(true);
    const url = this.router.parseUrl(this.router.url);
    const path = this.router.url.split(/[?#]/)[0];
    if (this.auth.state() === 'anonymous' && path === '/') {
      await this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
    } else if (this.auth.user() && (path === '/login' || path === '/register')) {
      await this.router.navigateByUrl(safeReturnUrl(url.queryParams['returnUrl'] ?? null));
    }
  }
}
