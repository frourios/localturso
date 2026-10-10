import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { generateKeyPair, exportJWK } from 'jose';
import * as schema from './schema';
import { env } from './serverEnvs';

export async function createStore(directory: string) {
  await mkdir(directory, { recursive: true });
  const client = createClient({ url: `file:${resolve(directory, 'platform.db')}` });
  await client.execute('PRAGMA foreign_keys = ON');
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve('drizzle') });
  await db
    .insert(schema.groups)
    .values({ name: 'default', id: randomUUID(), location: 'local' })
    .onConflictDoNothing();
  const { privateKey } = await generateKeyPair('EdDSA', { extractable: true });
  await db
    .insert(schema.settings)
    .values({ key: 'jwt-private-key', value: JSON.stringify(await exportJWK(privateKey)) })
    .onConflictDoNothing();
  return { db, client };
}
export type Store = Awaited<ReturnType<typeof createStore>>;
let store: Promise<Store> | undefined;
export const getStore = () => (store ??= createStore(env.LOCALTURSO_DATA_DIR));
