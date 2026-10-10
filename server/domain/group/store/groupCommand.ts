import { eq } from 'drizzle-orm';
import type { Store } from '../../../service/drizzleClient';
import { groups, type GroupRecord } from '../../../service/schema';
export const groupCommand = {
  save: (store: Store, record: GroupRecord) => store.db.insert(groups).values(record),
  delete: (store: Store, name: string) => store.db.delete(groups).where(eq(groups.name, name)),
  update: (store: Store, name: string, values: Partial<GroupRecord>) =>
    store.db.update(groups).set(values).where(eq(groups.name, name)),
};
