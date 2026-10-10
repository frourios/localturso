import { randomUUID } from 'node:crypto';
import type { GroupRecord } from '../../../service/schema';
export const groupMethod = {
  create: (name: string, location: string): GroupRecord => ({
    name,
    location,
    id: randomUUID(),
    tokenVersion: 0,
    deleteProtection: false,
  }),
};
