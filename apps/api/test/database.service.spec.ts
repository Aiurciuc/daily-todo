import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { DatabaseService } from '../src/database/database.service';

// Connecting Prisma's driver adapter initializes the pool lazily; this does not
// execute SQL or require a running PostgreSQL server.
describe('DatabaseService lifecycle', () => {
  it('disposes its externally created pool on application shutdown', async () => {
    const end = vi.spyOn(Pool.prototype, 'end');
    const database = new DatabaseService({
      host: 'localhost',
      port: 5432,
      database: 'unused',
      user: 'unused',
      password: 'unused',
    });
    try {
      await database.$connect();
      expect(end).not.toHaveBeenCalled();
      await database.onApplicationShutdown();
      expect(end).toHaveBeenCalledOnce();
    } finally {
      await database.$disconnect();
      end.mockRestore();
    }
  });
});
