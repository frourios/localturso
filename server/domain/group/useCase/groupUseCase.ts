import type { Store } from '../../../service/drizzleClient';
import { mutate } from '../../../service/lock';
import { assertPlatform } from '../../../service/platformError';
import { databaseQuery } from '../../database/store/databaseQuery';
import { groupMethod } from '../model/groupMethod';
import { groupCommand } from '../store/groupCommand';
import { groupQuery } from '../store/groupQuery';
export class GroupUseCase {
  constructor(private store: Store) {}
  create(name: string, location: string) {
    return mutate(async () => {
      assertPlatform(
        !(await groupQuery.list(this.store)).some((g) => g.name === name),
        409,
        'group already exists',
      );
      const record = groupMethod.create(name, location);
      await groupCommand.save(this.store, record);
      return record;
    });
  }
  delete(name: string) {
    return mutate(async () => {
      const record = await groupQuery.find(this.store, name);
      assertPlatform(!record.deleteProtection, 400, 'group is protected from deletion');
      assertPlatform(
        !(await databaseQuery.list(this.store)).some((db) => db.group === name),
        409,
        'group contains databases; delete them first',
      );
      await groupCommand.delete(this.store, name);
      return record;
    });
  }
  configure(name: string, protection: boolean) {
    return mutate(async () => {
      await groupQuery.find(this.store, name);
      await groupCommand.update(this.store, name, { deleteProtection: protection });
      return { delete_protection: protection };
    });
  }
  invalidate(name: string) {
    return mutate(async () => {
      const record = await groupQuery.find(this.store, name);
      await groupCommand.update(this.store, name, { tokenVersion: record.tokenVersion + 1 });
    });
  }
}
