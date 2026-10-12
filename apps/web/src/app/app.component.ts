import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { ConnectionStatusService } from './connection-status.service';

type ViewState = 'checking' | 'connected' | 'database-unavailable' | 'api-unreachable';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <main class="panel" aria-live="polite">
      <div class="eyebrow">LOCAL TODO · SETUP CHECK</div>
      <h1>Service connectivity</h1>
      <p class="intro">A simple check that the web app, API, and database can communicate.</p>

      <div class="status" [class.good]="state() === 'connected'" [class.bad]="state() === 'database-unavailable' || state() === 'api-unreachable'">
        <span class="dot" aria-hidden="true"></span>
        <strong>{{ message() }}</strong>
      </div>
      <p class="detail">{{ detail() }}</p>
      <button type="button" (click)="retry()" [disabled]="state() === 'checking'">
        {{ state() === 'checking' ? 'Checking…' : 'Retry connection' }}
      </button>
      <div class="checks">
        <span><i [class.on]="state() !== 'api-unreachable'"></i> Web → API</span>
        <span><i [class.on]="state() === 'connected'"></i> API → Database</span>
      </div>
    </main>
  `,
  styles: [`
    :host { min-height:100vh; display:grid; place-items:center; padding:24px; box-sizing:border-box; }
    .panel { width:min(100%, 510px); padding:40px; box-sizing:border-box; background:#fff; border:1px solid #e2e8f0; border-radius:20px; box-shadow:0 18px 55px #19335112; }
    .eyebrow { color:#4775b8; font-size:12px; font-weight:750; letter-spacing:.13em; }
    h1 { margin:14px 0 8px; color:#14253d; font-size:30px; letter-spacing:-.03em; }
    .intro,.detail { color:#64748b; line-height:1.6; }
    .status { display:flex; align-items:center; gap:11px; margin-top:27px; padding:15px; border-radius:12px; background:#f1f5f9; color:#334155; }
    .status.good { color:#166534; background:#f0fdf4; }
    .status.bad { color:#9f3030; background:#fff1f2; }
    .dot { width:10px; height:10px; border-radius:100%; background:#94a3b8; }
    .good .dot { background:#22a35a; }.bad .dot { background:#dc4b4b; }
    .detail { min-height:25px; font-size:14px; }
    button { border:0; border-radius:9px; padding:12px 17px; color:white; background:#285ea8; font:inherit; font-weight:650; cursor:pointer; }
    button:disabled { opacity:.65; cursor:wait; }
    .checks { display:flex; gap:22px; margin-top:30px; padding-top:20px; border-top:1px solid #e8edf3; color:#64748b; font-size:13px; }
    .checks span { display:flex; gap:8px; align-items:center; }
    .checks i { display:inline-block; width:8px; height:8px; border-radius:50%; background:#cbd5e1; }
    .checks i.on { background:#22a35a; }
    @media (max-width:480px) { .panel { padding:28px 22px; } .checks { flex-direction:column; gap:12px; } }
  `],
})
export class AppComponent implements OnInit {
  readonly state = signal<ViewState>('checking');

  constructor(private readonly connection: ConnectionStatusService) {}

  ngOnInit(): void { this.retry(); }

  message(): string {
    const messages: Record<ViewState, string> = {
      checking: 'Checking connection…',
      connected: 'All services connected',
      'database-unavailable': 'Database unavailable',
      'api-unreachable': 'API unreachable',
    };
    return messages[this.state()];
  }

  detail(): string {
    const details: Record<ViewState, string> = {
      checking: 'Contacting the API and checking its database connection.',
      connected: 'The frontend reached the API, and the API successfully queried PostgreSQL.',
      'database-unavailable': 'The API responded, but could not complete its PostgreSQL readiness check. Start or check the database, then retry.',
      'api-unreachable': 'The readiness endpoint could not be reached. Check the API and web proxy, then retry.',
    };
    return details[this.state()];
  }

  retry(): void {
    this.state.set('checking');
    this.connection.check().subscribe({
      next: (result) => this.state.set(result.api === 'ok' && result.database === 'ok' ? 'connected' : 'database-unavailable'),
      error: (error: HttpErrorResponse) => {
        this.state.set(error.status === 503 ? 'database-unavailable' : 'api-unreachable');
      },
    });
  }
}
