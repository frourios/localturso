import type { GroupDto } from '../../../../src/schemas/platform';
import type { GroupRecord } from '../../../service/schema';
export const toGroupDto = (record: GroupRecord): GroupDto => ({
  name: record.name,
  uuid: record.id,
  primary: record.location,
  locations: [record.location],
  delete_protection: record.deleteProtection,
});
