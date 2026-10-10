import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'turso',
  schema: './server/service/schema.ts',
  out: './drizzle',
  dbCredentials: { url: `file:${process.env.LOCALTURSO_DATA_DIR ?? './data'}/platform.db` },
});
