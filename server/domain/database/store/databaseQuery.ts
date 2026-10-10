import { eq } from 'drizzle-orm';
import type { Store } from '../../../service/drizzleClient';
import { PlatformError } from '../../../service/platformError';
import { databases } from '../../../service/schema';
export const databaseQuery = {
  list: (store: Store) => store.db.select().from(databases).orderBy(databases.name),
  async find(store: Store, name: string) {
    const [record] = await store.db.select().from(databases).where(eq(databases.name, name));
    if (!record) throw new PlatformError(404, 'database not found');
    return record;
  },
  async findById(store: Store, id: string) {
    const [record] = await store.db.select().from(databases).where(eq(databases.id, id));
    if (!record) throw new PlatformError(404, 'database not found');
    return record;
  },
};
