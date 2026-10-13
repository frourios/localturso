import type { z } from 'zod';
import type { createDatabaseSchema, databaseConfigSchema } from '../../../../src/schemas/platform';
import type { Store } from '../../../service/drizzleClient';
import { LibsqlServer } from '../../../service/libsqlServer';
import { mutate } from '../../../service/lock';
import { assertPlatform } from '../../../service/platformError';
import { validateResourceName } from '../../../service/resourceName';
import { env } from '../../../service/serverEnvs';
import { groupQuery } from '../../group/store/groupQuery';
import { databaseMethod } from '../model/databaseMethod';
import { databaseCommand } from '../store/databaseCommand';
import { databaseQuery } from '../store/databaseQuery';
export class DatabaseUseCase {
  constructor(
    private store: Store,
    private server = new LibsqlServer(),
  ) {}
  create(input: z.infer<typeof createDatabaseSchema>) {
    validateResourceName(input.name, 'database');
    return mutate(async () => {
      assertPlatform(
        !(await databaseQuery.list(this.store)).some((db) => db.name === input.name),
        409,
        `database with name ${input.name} already exists`,
      );
      assertPlatform(
        !env.LOCALTURSO_TOKEN_GROUP || input.group === env.LOCALTURSO_TOKEN_GROUP,
        404,
        'group not found',
      );
      await groupQuery.find(this.store, input.group);
      const parent = input.seed ? await databaseQuery.find(this.store, input.seed.name) : undefined;
      if (parent)
        assertPlatform(
          !env.LOCALTURSO_TOKEN_GROUP || parent.group === env.LOCALTURSO_TOKEN_GROUP,
          404,
          'database not found',
        );
      const record = databaseMethod.create(input.name, input.group, parent);
      if (parent) {
        await this.server.fork(parent.id, record.id);
        // Forks inherit namespace config; new databases start without read/write blocks.
        try {
          await this.server.configure(record.id, false, false);
        } catch (error) {
          await this.server.delete(record.id);
          throw error;
        }
      } else await this.server.create(record.id);
      try {
        await databaseCommand.save(this.store, record);
      } catch (error) {
        await this.server.delete(record.id);
        throw error;
      }
      return record;
    });
  }
  delete(name: string) {
    return mutate(async () => {
      const record = await databaseQuery.find(this.store, name);
      const group = await groupQuery.find(this.store, record.group);
      assertPlatform(
        !record.deleteProtection && !group.deleteProtection,
        400,
        'database is protected from deletion',
      );
      await this.server.delete(record.id);
      await databaseCommand.delete(this.store, name);
      return name;
    });
  }
  configure(name: string, input: z.infer<typeof databaseConfigSchema>) {
    return mutate(async () => {
      const record = await databaseQuery.find(this.store, name);
      const updated = {
        ...record,
        blockReads: input.block_reads ?? record.blockReads,
        blockWrites: input.block_writes ?? record.blockWrites,
        deleteProtection: input.delete_protection ?? record.deleteProtection,
      };
      await this.server.configure(record.id, updated.blockReads, updated.blockWrites);
      await databaseCommand.update(this.store, name, updated);
      return updated;
    });
  }
  invalidate(name: string) {
    return mutate(async () => {
      const record = await databaseQuery.find(this.store, name);
      await databaseCommand.update(this.store, name, { tokenVersion: record.tokenVersion + 1 });
    });
  }
}
