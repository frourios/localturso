import { toGroupDto } from '../../../../../../../server/domain/group/store/groupDto';
import { groupQuery } from '../../../../../../../server/domain/group/store/groupQuery';
import { GroupUseCase } from '../../../../../../../server/domain/group/useCase/groupUseCase';
import { getStore } from '../../../../../../../server/service/drizzleClient';
import { json } from '../../../../../../../server/service/http';
import { platformRoute } from '../../../../../../../server/service/platformRoute';
export { options as OPTIONS } from '../../../../../../../server/service/http';

export const GET = platformRoute<{ org: string; name: string }>(async (_request, { name }) =>
  json({ group: toGroupDto(await groupQuery.find(await getStore(), name)) }),
);

export const DELETE = platformRoute<{ org: string; name: string }>(async (_request, { name }) =>
  json({ group: toGroupDto(await new GroupUseCase(await getStore()).delete(name)) }),
);
