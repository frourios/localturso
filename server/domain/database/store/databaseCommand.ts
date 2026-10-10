import { eq } from 'drizzle-orm';
import type { Store } from '../../../service/drizzleClient';
import { databases, type DatabaseRecord } from '../../../service/schema';
export const databaseCommand = {
  save: (store: Store, record: DatabaseRecord) => store.db.insert(databases).values(record),
  delete: (store: Store, name: string) =>
    store.db.delete(databases).where(eq(databases.name, name)),
  update: (store: Store, name: string, values: Partial<DatabaseRecord>) =>
    store.db.update(databases).set(values).where(eq(databases.name, name)),
};
