import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Auth } from '../auth';
import { CalendarPreviewComponent } from '../../calendar-preview/calendar-preview.component';

@Component({
  selector: 'app-private-calendar',
  imports: [CalendarPreviewComponent],
  templateUrl: './private-calendar.component.html',
  styleUrl: './private-calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivateCalendarComponent {
  private readonly auth = inject(Auth);
  protected readonly users = computed(() => {
    const user = this.auth.user();
    return user ? [user] : [];
  });
}
