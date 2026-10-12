import { HealthController } from '../src/health/health.controller';

function responseMock() {
  const response: any = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response;
}

describe('HealthController', () => {
  it('reports liveness without depending on PostgreSQL', () => {
    const controller = new HealthController({} as never);
    expect(controller.live()).toEqual({ api: 'ok' });
  });

  it('reports database connectivity after executing the probe', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
    const controller = new HealthController(pool as never);
    const response = responseMock();
    await controller.ready(response);
    expect(pool.query).toHaveBeenCalledWith('SELECT 1');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ api: 'ok', database: 'ok' });
  });

  it('returns a sanitized unavailable response on database failure', async () => {
    const pool = { query: jest.fn().mockRejectedValue(new Error('secret connection details')) };
    const controller = new HealthController(pool as never);
    const response = responseMock();
    await controller.ready(response);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({ api: 'ok', database: 'unavailable' });
  });
});
