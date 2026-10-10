import { randomUUID } from 'node:crypto';
import type { DatabaseRecord } from '../../../service/schema';
export const databaseMethod = {
  create: (name: string, group: string, parent?: DatabaseRecord): DatabaseRecord => ({
    name,
    group,
    id: randomUUID(),
    tokenVersion: 0,
    blockReads: false,
    blockWrites: false,
    deleteProtection: false,
    parentId: parent?.id ?? null,
    parentName: parent?.name ?? null,
    branchedAt: parent ? new Date().toISOString() : null,
  }),
};
