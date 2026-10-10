import type { DatabaseDto } from '../../../../src/schemas/platform';
import type { DatabaseRecord } from '../../../service/schema';
import { env } from '../../../service/serverEnvs';
export function databaseUrl(record: DatabaseRecord) {
  return `${env.LOCALTURSO_PUBLIC_URL.replace(/\/$/, '')}/db/${record.id}/`;
}
export function toDatabaseDto(record: DatabaseRecord): DatabaseDto {
  return {
    Name: record.name,
    DbId: record.id,
    Hostname: databaseUrl(record).replace(/^https?:\/\//, ''),
    group: record.group,
    primaryRegion: 'local',
    regions: ['local'],
    block_reads: record.blockReads,
    block_writes: record.blockWrites,
    delete_protection: record.deleteProtection,
    parent: record.parentId
      ? { id: record.parentId, name: record.parentName!, branched_at: record.branchedAt! }
      : null,
  };
}
