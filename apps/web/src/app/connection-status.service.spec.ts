import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConnectionStatusService } from './connection-status.service';

describe('ConnectionStatusService', () => {
  let service: ConnectionStatusService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ConnectionStatusService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('checks API readiness through the same-origin API path', () => {
    let result: unknown;
    service.check().subscribe((value) => result = value);
    const request = http.expectOne('/api/health/ready');
    expect(request.request.method).toBe('GET');
    request.flush({ api: 'ok', database: 'ok' });
    expect(result).toEqual({ api: 'ok', database: 'ok' });
  });
});
