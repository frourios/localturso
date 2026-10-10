import { toDatabaseDto } from '../../../../../../../server/domain/database/store/databaseDto';
import { databaseQuery } from '../../../../../../../server/domain/database/store/databaseQuery';
import { DatabaseUseCase } from '../../../../../../../server/domain/database/useCase/databaseUseCase';
import { getStore } from '../../../../../../../server/service/drizzleClient';
import { json } from '../../../../../../../server/service/http';
import { platformRoute } from '../../../../../../../server/service/platformRoute';
export { options as OPTIONS } from '../../../../../../../server/service/http';

export const GET = platformRoute<{ org: string; name: string }>(async (_request, { name }) =>
  json({ database: toDatabaseDto(await databaseQuery.find(await getStore(), name)) }),
);

export const DELETE = platformRoute<{ org: string; name: string }>(async (_request, { name }) =>
  json({ database: await new DatabaseUseCase(await getStore()).delete(name) }),
);
