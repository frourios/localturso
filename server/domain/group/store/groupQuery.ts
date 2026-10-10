import { eq } from 'drizzle-orm';
import type { Store } from '../../../service/drizzleClient';
import { PlatformError } from '../../../service/platformError';
import { groups } from '../../../service/schema';
export const groupQuery = {
  list: (store: Store) => store.db.select().from(groups).orderBy(groups.name),
  async find(store: Store, name: string) {
    const [record] = await store.db.select().from(groups).where(eq(groups.name, name));
    if (!record) throw new PlatformError(404, 'group not found');
    return record;
  },
};
