import { toDatabaseDto } from '../../../../../../server/domain/database/store/databaseDto';
import { databaseQuery } from '../../../../../../server/domain/database/store/databaseQuery';
import { DatabaseUseCase } from '../../../../../../server/domain/database/useCase/databaseUseCase';
import { getStore } from '../../../../../../server/service/drizzleClient';
import { json, readJson } from '../../../../../../server/service/http';
import { platformRoute } from '../../../../../../server/service/platformRoute';
import { createDatabaseSchema } from '../../../../../schemas/platform';
export { options as OPTIONS } from '../../../../../../server/service/http';

export const GET = platformRoute<{ org: string }>(async (request) => {
  const url = new URL(request.url);
  const records = (await databaseQuery.list(await getStore())).filter(
    (db) =>
      (!url.searchParams.has('group') || db.group === url.searchParams.get('group')) &&
      (!url.searchParams.has('parent') || db.parentId === url.searchParams.get('parent')),
  );
  return json({ databases: records.map(toDatabaseDto) });
});

export const POST = platformRoute<{ org: string }>(async (request) => {
  const record = await new DatabaseUseCase(await getStore()).create(
    createDatabaseSchema.parse(await readJson(request)),
  );
  const dto = toDatabaseDto(record);
  return json({ database: { DbId: dto.DbId, Hostname: dto.Hostname, Name: dto.Name } });
});
