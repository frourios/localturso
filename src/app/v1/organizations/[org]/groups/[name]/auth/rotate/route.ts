import { GroupUseCase } from '../../../../../../../../../server/domain/group/useCase/groupUseCase';
import { getStore } from '../../../../../../../../../server/service/drizzleClient';
import { json } from '../../../../../../../../../server/service/http';
import { groupPlatformRoute as platformRoute } from '../../../../../../../../../server/service/platformRoute';
export { options as OPTIONS } from '../../../../../../../../../server/service/http';

export const POST = platformRoute<{ org: string; name: string }>(async (_request, { name }) => {
  await new GroupUseCase(await getStore()).invalidate(name);
  return json({});
});
