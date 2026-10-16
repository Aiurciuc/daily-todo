import { defineConfig } from 'prisma/config';
import { databaseUrl } from './src/database/config';

// Prisma 6 reads the datasource URL from schema.prisma, not the config object.
// Client generation remains offline; migrations use the validated DB_* settings.
process.env.DATABASE_URL = process.argv.includes('generate')
  ? 'postgresql://localhost:5432/build-only'
  : databaseUrl();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
});
