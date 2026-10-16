import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { DatabaseService } from '../src/database/database.service';

describe('health', () => {
  it('resolves constructor injection and reports liveness without querying the database', async () => {
    const database = { $queryRaw: vi.fn() };
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: DatabaseService, useValue: database }],
    }).compile();
    try {
      expect(module.get(HealthController).live()).toEqual({ api: 'ok' });
      expect(database.$queryRaw).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });

  it('reports a successful database query', async () => {
    const database = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new HealthService(database as unknown as DatabaseService);
    expect(await service.ready()).toEqual({ api: 'ok', database: 'ok' });
    expect(database.$queryRaw).toHaveBeenCalledOnce();
  });

  it('does not expose database errors', async () => {
    const database = { $queryRaw: vi.fn().mockRejectedValue(new Error('sensitive credentials')) };
    const service = new HealthService(database as unknown as DatabaseService);
    try {
      await service.ready();
      throw new Error('Expected readiness to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        api: 'ok',
        database: 'unavailable',
      });
    }
  });
});
