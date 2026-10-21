import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  applyWhen,
  disabled,
  email,
  form,
  FormField,
  maxLength,
  minLength,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { TerraButton, TerraIcon } from 'terra-ui';
import { Auth } from '../auth';
import { safeReturnUrl } from '../auth-routing';

@Component({
  selector: 'app-auth-page',
  imports: [FormField, RouterLink, TerraButton, TerraIcon],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPageComponent {
  private readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly register = this.route.snapshot.data['register'] === true;
  protected readonly returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  protected readonly expired = this.route.snapshot.queryParamMap.get('expired') === '1';
  protected readonly pending = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);
  protected readonly model = signal({ name: '', email: '', password: '', confirmation: '' });
  protected readonly fields = form(this.model, (s) => {
    disabled(s, () => this.pending());
    required(s.email, { message: 'Enter your email address.' });
    email(s.email, { message: 'Enter a valid email address.' });
    maxLength(s.email, 254, { message: 'Use no more than 254 characters.' });
    required(s.password, { message: 'Enter your password.' });
    minLength(s.password, 8, { message: 'Use at least 8 characters.' });
    maxLength(s.password, 128, { message: 'Use no more than 128 characters.' });
    applyWhen(
      s,
      () => this.register,
      (registration) => {
        required(registration.name, { message: 'Enter your name.' });
        maxLength(registration.name, 120, { message: 'Use no more than 120 characters.' });
        validate(registration.name, ({ value }) =>
          value().trim() ? undefined : { kind: 'blank', message: 'Enter your name.' },
        );
        required(registration.confirmation, { message: 'Confirm your password.' });
        validate(registration.confirmation, ({ value, valueOf }) =>
          value() === valueOf(registration.password)
            ? undefined
            : { kind: 'mismatch', message: 'Passwords must match.' },
        );
      },
    );
  });

  constructor() {
    effect(() => {
      if (this.auth.user()) void this.router.navigateByUrl(this.returnUrl);
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.pending()) return;
    this.error.set('');
    void submit(this.fields, async () => {
      this.pending.set(true);
      const { name, email, password } = this.model();
      try {
        if (this.register)
          await this.auth.register({ name: name.trim(), email: email.trim(), password });
        else await this.auth.login({ email: email.trim(), password });
        this.model.set({ name: '', email: '', password: '', confirmation: '' });
      } catch (error: unknown) {
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        this.error.set(
          status === 401
            ? 'Email or password is incorrect.'
            : status === 409
              ? 'An account with this email already exists. Try signing in.'
              : status === 400
                ? 'Check your details and try again.'
                : status === 429
                  ? 'Too many attempts. Please wait and try again.'
                  : 'We couldn’t connect. Please try again.',
        );
      } finally {
        this.pending.set(false);
      }
    });
  }
}
