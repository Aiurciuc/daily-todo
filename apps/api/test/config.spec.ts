import { describe, expect, it } from 'vitest';
import { apiSettings } from '../src/config/app.config';
import { databaseSettings } from '../src/database/config';

const database = {
  DB_HOST: 'localhost',
  DB_NAME: 'todo',
  DB_USER: 'user',
  DB_PASSWORD: 'password',
};

describe('configuration', () => {
  it('provides validated defaults without loading dotenv in the parser', () => {
    expect(apiSettings({})).toEqual({ port: 3000, host: '0.0.0.0' });
    expect(databaseSettings(database)).toEqual({
      host: 'localhost',
      port: 5432,
      database: 'todo',
      user: 'user',
      password: 'password',
    });
  });

  it('fails fast on missing settings and invalid TCP ports', () => {
    expect(() => databaseSettings({})).toThrow('Missing required database configuration');
    expect(() => apiSettings({ API_HOST: ' ' })).toThrow('API_HOST must not be empty');
    for (const port of ['0', '-1', '1.5', '65536', 'invalid', '']) {
      expect(() => apiSettings({ API_PORT: port })).toThrow('API_PORT must be a valid TCP port');
      expect(() => databaseSettings({ ...database, DB_PORT: port })).toThrow(
        'DB_PORT must be a valid TCP port',
      );
    }
  });
});
