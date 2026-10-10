import { databaseQuery } from '../../../../../../../../server/domain/database/store/databaseQuery';
import { DatabaseUseCase } from '../../../../../../../../server/domain/database/useCase/databaseUseCase';
import { getStore } from '../../../../../../../../server/service/drizzleClient';
import { json, readJson } from '../../../../../../../../server/service/http';
import { platformRoute } from '../../../../../../../../server/service/platformRoute';
import { databaseConfigSchema } from '../../../../../../../schemas/platform';
export { options as OPTIONS } from '../../../../../../../../server/service/http';

function configuration(record: {
  blockReads: boolean;
  blockWrites: boolean;
  deleteProtection: boolean;
}) {
  return json({
    block_reads: record.blockReads,
    block_writes: record.blockWrites,
    delete_protection: record.deleteProtection,
  });
}

export const GET = platformRoute<{ org: string; name: string }>(async (_request, { name }) =>
  configuration(await databaseQuery.find(await getStore(), name)),
);

export const PATCH = platformRoute<{ org: string; name: string }>(async (request, { name }) =>
  configuration(
    await new DatabaseUseCase(await getStore()).configure(
      name,
      databaseConfigSchema.parse(await readJson(request)),
    ),
  ),
);
