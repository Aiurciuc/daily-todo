import { registerAs } from '@nestjs/config';
import { databaseSettings } from '../database/config';

export function apiSettings(environment: NodeJS.ProcessEnv = process.env) {
  const port = Number(environment.API_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be a valid TCP port');
  }
  const host = environment.API_HOST ?? '0.0.0.0';
  if (!host.trim()) throw new Error('API_HOST must not be empty');
  return { port, host };
}

export const apiConfig = registerAs('api', () => apiSettings());
export const databaseConfig = registerAs('database', () => databaseSettings());
