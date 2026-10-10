import { DatabaseUseCase } from '../../../../../../../../../server/domain/database/useCase/databaseUseCase';
import { getStore } from '../../../../../../../../../server/service/drizzleClient';
import { json } from '../../../../../../../../../server/service/http';
import { platformRoute } from '../../../../../../../../../server/service/platformRoute';
export { options as OPTIONS } from '../../../../../../../../../server/service/http';

export const POST = platformRoute<{ org: string; name: string }>(async (_request, { name }) => {
  await new DatabaseUseCase(await getStore()).invalidate(name);
  return json({});
});
