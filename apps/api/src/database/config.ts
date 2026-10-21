import { resolve } from 'node:path';
import { config } from 'dotenv';

export function loadDatabaseEnvironment(): void {
  config({ path: resolve(process.cwd(), '../../.env') });
  config();
}

export function databaseSettings(environment: NodeJS.ProcessEnv = process.env) {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;
  const missing = required.filter((key) => !environment[key]);
  if (missing.length)
    throw new Error(`Missing required database configuration: ${missing.join(', ')}`);
  const port = Number(environment.DB_PORT ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('DB_PORT must be a valid TCP port');
  return {
    host: environment.DB_HOST!,
    port,
    database: environment.DB_NAME!,
    user: environment.DB_USER!,
    password: environment.DB_PASSWORD!,
  };
}

// 31009

export function databaseUrl(): string {
  loadDatabaseEnvironment();
  const settings = databaseSettings();
  const url = new URL('postgresql://localhost');
  url.hostname = settings.host;
  url.port = String(settings.port);
  url.username = settings.user;
  url.password = settings.password;
  url.pathname = `/${encodeURIComponent(settings.database)}`;
  return url.toString();
}
