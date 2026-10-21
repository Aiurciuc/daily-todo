import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TerraButton, TerraIcon, TerraSegmentedFilter, TerraSegment } from 'terra-ui';
import { DatePipe } from '@angular/common';
import { CalendarView } from '../calendar-preview.models';
import { Auth } from '../../auth/auth';
import { Router } from '@angular/router';
@Component({
  selector: 'app-calendar-header',
  imports: [DatePipe, TerraButton, TerraIcon, TerraSegmentedFilter],

  templateUrl: './calendar-header.component.html',
  styleUrl: './calendar-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarHeaderComponent {
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly loggingOut = signal(false);
  protected readonly logoutError = signal('');

  protected async logout(): Promise<void> {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.logoutError.set('');
    try {
      await this.auth.logout();
      await this.router.navigate(['/login']);
    } catch {
      this.logoutError.set('Could not sign out. Check your connection and try again.');
    } finally {
      this.loggingOut.set(false);
    }
  }

  protected readonly today = new Date();
  protected readonly viewOptions: readonly TerraSegment<CalendarView>[] = [
    { value: 'Day', label: 'Day' },
    { value: 'Week', label: 'Week' },
  ];
  readonly view = input.required<CalendarView>();
  readonly activeDate = input(new Date());
  readonly rangeStart = input.required<Date>();
  readonly month = input(new Date());
  readonly rangeEnd = input.required<Date>();
  readonly offset = input.required<number>();
  readonly viewChanged = output<CalendarView>();
  readonly periodMoved = output<number>();
  readonly todayRequested = output<void>();
  readonly createRequested = output<void>();
}
