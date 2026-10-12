import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type ReadinessStatus = { api: 'ok'; database: 'ok' | 'unavailable' };

@Injectable({ providedIn: 'root' })
export class ConnectionStatusService {
  private readonly http = inject(HttpClient);

  check(): Observable<ReadinessStatus> {
    return this.http.get<ReadinessStatus>('/api/health/ready', { timeout: 7000 });
  }
}
