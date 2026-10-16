import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CalendarPreviewComponent } from './features/calendar-preview/calendar-preview.component';

@Component({
  selector: 'app-root',
  imports: [CalendarPreviewComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
